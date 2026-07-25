import { SignJWT, jwtVerify } from 'jose'
import {
  validateJWTSecret,
  SESSION_IDLE_TIMEOUT_SECONDS,
} from '../identity/validation'
import { checkRateLimit } from '../identity/rate-limit'
import type { Env } from '../../server/env'

interface VerifiedPayload {
  sub: string
  username: string
  role: 'user' | 'admin'
  sid?: string
}

interface SessionRow {
  id: string
  user_id: string
  last_used_at: number
}

let cachedSecret: string | null = null
function jwtSecret(env: Env): string {
  if (cachedSecret === null) cachedSecret = validateJWTSecret(env.JWT_SECRET)
  return cachedSecret
}

function json(data: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers)
  headers.set('Content-Type', 'application/json; charset=utf-8')
  headers.set('Cache-Control', 'no-store')
  return new Response(JSON.stringify(data), { ...init, headers })
}

function corsHeaders(env: Env, request: Request): Headers {
  const headers = new Headers()
  const allowed = env.ALLOWED_ORIGIN ?? 'https://app.adiabatic.garden'
  const origin = request.headers.get('Origin')
  if (origin && origin === allowed) {
    headers.set('Access-Control-Allow-Origin', origin)
    headers.set('Vary', 'Origin')
    headers.set(
      'Access-Control-Allow-Methods',
      'GET, HEAD, POST, DELETE, OPTIONS, PATCH, PUT',
    )
    headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    headers.set('Access-Control-Allow-Credentials', 'true')
  }
  return headers
}

function withCors(env: Env, request: Request, response: Response): Response {
  const res = new Response(response.body, response)
  const cors = corsHeaders(env, request)
  cors.forEach((value, key) => res.headers.set(key, value))
  return res
}

export async function verifyAuth(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<
  | { ok: true; payload: VerifiedPayload; userId: string }
  | { ok: false; response: Response }
> {
  const auth = request.headers.get('Authorization')
  if (!auth?.startsWith('Bearer ')) {
    const headers = corsHeaders(env, request)
    headers.set('X-Session-Invalid', '1')
    headers.set('Access-Control-Expose-Headers', 'X-Session-Invalid')
    return {
      ok: false,
      response: withCors(
        env,
        request,
        json('Unauthorized', { status: 401, headers }),
      ),
    }
  }
  const token = auth.slice('Bearer '.length)
  const secret = new TextEncoder().encode(jwtSecret(env))
  let payload: VerifiedPayload
  try {
    const { payload: verified } = await jwtVerify(token, secret)
    payload = verified as unknown as VerifiedPayload
  } catch {
    const headers = corsHeaders(env, request)
    headers.set('X-Session-Invalid', '1')
    headers.set('Access-Control-Expose-Headers', 'X-Session-Invalid')
    return {
      ok: false,
      response: withCors(
        env,
        request,
        json('Session invalid', { status: 401, headers }),
      ),
    }
  }
  const userId = payload.sub

  if (payload.sid && payload.role !== 'admin') {
    const session = (await env.DB.prepare(
      'SELECT last_used_at FROM sessions WHERE id = ? AND user_id = ?',
    )
      .bind(payload.sid, userId)
      .first()) as SessionRow | null
    if (!session) {
      const headers = corsHeaders(env, request)
      headers.set('X-Session-Invalid', '1')
      headers.set('Access-Control-Expose-Headers', 'X-Session-Invalid')
      return {
        ok: false,
        response: withCors(
          env,
          request,
          json('Session expired or revoked', { status: 401, headers }),
        ),
      }
    }
    const now = Math.floor(Date.now() / 1000)
    const lastUsed = session.last_used_at ?? now
    if (now - lastUsed > SESSION_IDLE_TIMEOUT_SECONDS) {
      ctx.waitUntil(
        env.DB.prepare('DELETE FROM sessions WHERE id = ?')
          .bind(payload.sid)
          .run(),
      )
      const headers = corsHeaders(env, request)
      headers.set('X-Session-Invalid', '1')
      headers.set('Access-Control-Expose-Headers', 'X-Session-Invalid')
      return {
        ok: false,
        response: withCors(
          env,
          request,
          json('Session expired due to inactivity', { status: 401, headers }),
        ),
      }
    }
    if (now - lastUsed > 300) {
      ctx.waitUntil(
        env.DB.prepare('UPDATE sessions SET last_used_at = ? WHERE id = ?')
          .bind(now, payload.sid)
          .run(),
      )
    }
  }

  return { ok: true, payload, userId }
}

async function clientIp(request: Request): Promise<string | null> {
  return (
    request.headers.get('CF-Connecting-IP') ??
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ??
    request.headers.get('X-Real-IP') ??
    null
  )
}

async function signToken(
  env: Env,
  payload: Record<string, unknown>,
  expiresIn: string,
): Promise<string> {
  const secret = new TextEncoder().encode(jwtSecret(env))
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret)
}

const MAX_BACKUPS = 10
const MAX_DATA_SIZE = 2_000_000 // D1 max row size is 2 MB

export async function handleVault(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const url = new URL(request.url)
  const path = url.pathname

  if (request.method === 'OPTIONS')
    return withCors(env, request, new Response(null, { status: 204 }))

  // Validate JWT secret early.
  try {
    jwtSecret(env)
  } catch {
    return withCors(
      env,
      request,
      json('Service unavailable: server configuration error', { status: 503 }),
    )
  }

  // --- Content CRUD ---

  if (path === '/api/content') {
    const auth = await verifyAuth(request, env, ctx)
    if (!auth.ok) return auth.response

    if (request.method === 'GET') {
      const metaOnly = url.searchParams.get('meta') === '1'
      if (metaOnly) {
        const result = await env.DB.prepare(
          'SELECT id, created_at, LENGTH(data) AS data_size FROM content WHERE user_id = ? ORDER BY created_at DESC',
        )
          .bind(auth.userId)
          .all()
        return withCors(env, request, json(result.results))
      }
      const result = await env.DB.prepare(
        'SELECT * FROM content WHERE user_id = ? ORDER BY created_at DESC',
      )
        .bind(auth.userId)
        .all()
      return withCors(env, request, json(result.results))
    }

    if (request.method === 'POST') {
      const body = (await request.json().catch(() => ({}))) as {
        data?: unknown
      }
      if (!body.data)
        return withCors(env, request, json('Missing data', { status: 400 }))
      const serialized = JSON.stringify(body.data)
      if (serialized.length > MAX_DATA_SIZE)
        return withCors(
          env,
          request,
          json('Backup too large (max 2 MB)', { status: 413 }),
        )
      const id = crypto.randomUUID()
      await env.DB.prepare(
        'INSERT INTO content (id, user_id, data) VALUES (?, ?, ?)',
      )
        .bind(id, auth.userId, serialized)
        .run()
      // Auto-prune: keep only the latest MAX_BACKUPS per user.
      const old = await env.DB.prepare(
        'SELECT id FROM content WHERE user_id = ? ORDER BY created_at DESC LIMIT -1 OFFSET ?',
      )
        .bind(auth.userId, MAX_BACKUPS)
        .all()
      if (old.results.length > 0) {
        const ids = old.results.map((r) => (r as { id: string }).id)
        await env.DB.prepare(
          `DELETE FROM content WHERE id IN (${ids.map(() => '?').join(',')})`,
        )
          .bind(...ids)
          .run()
      }
      return withCors(
        env,
        request,
        json({ message: 'Content saved', id }, { status: 201 }),
      )
    }
  }

  // Single backup by ID.
  const contentMatch = path.match(/^\/api\/content\/([^/]+)$/)
  if (contentMatch) {
    const auth = await verifyAuth(request, env, ctx)
    if (!auth.ok) return auth.response
    const backupId = contentMatch[1]

    if (request.method === 'GET') {
      const row = await env.DB.prepare(
        'SELECT * FROM content WHERE id = ? AND user_id = ?',
      )
        .bind(backupId, auth.userId)
        .first()
      if (!row)
        return withCors(env, request, json('Not found', { status: 404 }))
      return withCors(env, request, json(row))
    }

    if (request.method === 'DELETE') {
      await env.DB.prepare('DELETE FROM content WHERE id = ? AND user_id = ?')
        .bind(backupId, auth.userId)
        .run()
      return withCors(env, request, json({ message: 'Backup deleted' }))
    }
  }

  return withCors(env, request, json('Not found', { status: 404 }))
}
