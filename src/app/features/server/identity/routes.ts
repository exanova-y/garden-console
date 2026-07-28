import {
  validateJWTSecret,
  validatePassword,
  validateUsername,
  timingSafeEqual,
  SESSION_IDLE_TIMEOUT_SECONDS,
} from './validation'
import { verifyTOTP, generateTOTPSecret } from './totp'
import { checkRateLimit } from './rate-limit'
import type { Env } from '../../../../server/env'

interface SessionRow {
  id: string
  user_id: string
  last_used_at: number
}

function json(data: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers)
  headers.set('Content-Type', 'application/json; charset=utf-8')
  headers.set('Cache-Control', 'no-store')
  return new Response(JSON.stringify(data), { ...init, headers })
}

function corsHeaders(env: Env, request: Request): Headers {
  const headers = new Headers()
  const allowed = env.ALLOWED_ORIGIN ?? 'https://peacesign.adiabatic.garden'
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

function unauthorized(env: Env, request: Request, message: string): Response {
  const headers = corsHeaders(env, request)
  headers.set('X-Session-Invalid', '1')
  headers.set('Access-Control-Expose-Headers', 'X-Session-Invalid')
  return withCors(env, request, json(message, { status: 401, headers }))
}

function clientIp(request: Request): string | null {
  return (
    request.headers.get('CF-Connecting-IP') ??
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ??
    request.headers.get('X-Real-IP') ??
    null
  )
}

async function sessionInvalid(
  env: Env,
  request: Request,
  message: string,
): Promise<Response> {
  return unauthorized(env, request, message)
}

let cachedSecret: string | null = null
function jwtSecret(env: Env): string {
  if (cachedSecret === null) cachedSecret = validateJWTSecret(env.JWT_SECRET)
  return cachedSecret
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

import { SignJWT, jwtVerify } from 'jose'
import bcrypt from 'bcryptjs'

const DUMMY_HASH =
  '$2a$10$CCCCCCCCCCCCCCCCCCCCC.O0D3I6./CCCCCCCCCCCCCCCCCCCCCCC'

interface VerifiedPayload {
  sub: string
  username: string
  role: 'user' | 'admin'
  sid?: string
}

async function verifyAuth(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<
  | { ok: true; payload: VerifiedPayload; userId: string }
  | { ok: false; response: Response }
> {
  const auth = request.headers.get('Authorization')
  if (!auth?.startsWith('Bearer '))
    return {
      ok: false,
      response: await sessionInvalid(env, request, 'Unauthorized'),
    }
  const token = auth.slice('Bearer '.length)
  const secret = new TextEncoder().encode(jwtSecret(env))
  let payload: VerifiedPayload
  try {
    const { payload: verified } = await jwtVerify(token, secret)
    payload = verified as unknown as VerifiedPayload
  } catch {
    return {
      ok: false,
      response: await sessionInvalid(env, request, 'Session invalid'),
    }
  }
  const userId = payload.sub

  // Session validation for user JWTs (admin tokens have no sid).
  if (payload.sid && payload.role !== 'admin') {
    const session = (await env.DB.prepare(
      'SELECT last_used_at FROM sessions WHERE id = ? AND user_id = ?',
    )
      .bind(payload.sid, userId)
      .first()) as SessionRow | null
    if (!session)
      return {
        ok: false,
        response: await sessionInvalid(
          env,
          request,
          'Session expired or revoked',
        ),
      }
    const now = Math.floor(Date.now() / 1000)
    const lastUsed = session.last_used_at ?? now
    if (now - lastUsed > SESSION_IDLE_TIMEOUT_SECONDS) {
      ctx.waitUntil(
        env.DB.prepare('DELETE FROM sessions WHERE id = ?')
          .bind(payload.sid)
          .run(),
      )
      return {
        ok: false,
        response: await sessionInvalid(
          env,
          request,
          'Session expired due to inactivity',
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

const SENSITIVE_PATHS = new Set([
  '/api/login',
  '/api/register',
  '/api/user/password',
  '/api/user/me',
])

export async function handleIdentity(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const url = new URL(request.url)
  const path = url.pathname

  if (request.method === 'OPTIONS')
    return withCors(env, request, new Response(null, { status: 204 }))

  // Validate JWT secret early; return 503 on misconfiguration.
  try {
    jwtSecret(env)
  } catch {
    return withCors(
      env,
      request,
      json('Service unavailable: server configuration error', {
        status: 503,
      }),
    )
  }

  if (SENSITIVE_PATHS.has(path)) {
    const ip = clientIp(request)
    if (!ip)
      return withCors(
        env,
        request,
        json('Unable to identify client IP', { status: 400 }),
      )
    if (!(await checkRateLimit(env.DB, ip, 10, 60_000)))
      return withCors(
        env,
        request,
        json('Too many requests. Please try again later.', {
          status: 429,
          headers: { 'Retry-After': '60' },
        }),
      )
  }

  switch (path) {
    case '/api/register':
      if (request.method === 'POST') return await register(request, env)
      break
    case '/api/login':
      if (request.method === 'POST') return await login(request, env)
      break
    case '/api/session':
      if (request.method === 'GET') return await session(request, env, ctx)
      break
    case '/api/logout':
      if (request.method === 'POST') return await logout(request, env, ctx)
      break
    case '/api/user/me':
      if (request.method === 'DELETE') return await deleteMe(request, env, ctx)
      if (request.method === 'GET') return await me(request, env, ctx)
      break
    case '/api/user/profile':
      if (request.method === 'PATCH')
        return await updateProfile(request, env, ctx)
      break
    case '/api/user/password':
      if (request.method === 'POST')
        return await changePassword(request, env, ctx)
      break
    case '/api/auth/totp-setup':
      if (request.method === 'POST') return await totpSetup(request, env, ctx)
      break
    case '/api/auth/totp-verify':
      if (request.method === 'POST') return await totpVerify(request, env, ctx)
      break
  }
  return withCors(env, request, json('Not found', { status: 404 }))
}

async function register(request: Request, env: Env): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    username?: string
    password?: string
  }
  let { username, password } = body
  if (!username || !password)
    return withCors(env, request, json('Missing credentials', { status: 400 }))
  username = username.trim()
  if (!validateUsername(username))
    return withCors(
      env,
      request,
      json('Invalid username format', { status: 400 }),
    )
  const passVal = validatePassword(password)
  if (!passVal.valid)
    return withCors(env, request, json(passVal.error!, { status: 400 }))

  const existing = await env.DB.prepare(
    'SELECT id FROM users WHERE username = ?',
  )
    .bind(username)
    .first()
  if (existing)
    return withCors(
      env,
      request,
      json('Username already taken', { status: 409 }),
    )

  const hashedPassword = await bcrypt.hash(password, 10)
  const id = crypto.randomUUID()
  await env.DB.prepare(
    'INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)',
  )
    .bind(id, username, hashedPassword)
    .run()

  const sessionId = crypto.randomUUID()
  const userAgent = (request.headers.get('User-Agent') ?? 'Unknown').slice(
    0,
    500,
  )
  const ip = clientIp(request) ?? 'unknown'
  await env.DB.prepare(
    'INSERT INTO sessions (id, user_id, device_info, ip) VALUES (?, ?, ?, ?)',
  )
    .bind(sessionId, id, userAgent, ip)
    .run()

  const token = await signToken(
    env,
    { sub: id, username, role: 'user', sid: sessionId },
    '7d',
  )
  return withCors(
    env,
    request,
    json({ token, user: { id, username, isAdmin: false } }, { status: 201 }),
  )
}

async function login(request: Request, env: Env): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    username?: string
    password?: string
    totp_code?: string
    backup_code?: string
  }
  let { username, password, totp_code, backup_code } = body
  if (!username || !password)
    return withCors(env, request, json('Missing credentials', { status: 400 }))
  username = username.trim()

  // Admin login via env-managed credentials.
  const adminU = env.ADMIN_USERNAME
  const adminP = env.ADMIN_PASSWORD
  if (
    adminU &&
    adminP &&
    adminU.length > 0 &&
    adminP.length > 0 &&
    timingSafeEqual(username, adminU) &&
    timingSafeEqual(password, adminP)
  ) {
    await env.DB.prepare(
      "INSERT OR IGNORE INTO users (id, username, password_hash) VALUES ('admin', 'Admin', 'env_managed')",
    ).run()
    const token = await signToken(
      env,
      { sub: 'admin', username: 'Admin', role: 'admin' },
      '1d',
    )
    return withCors(
      env,
      request,
      json({ token, user: { id: 'admin', username: 'Admin', isAdmin: true } }),
    )
  }

  const user = (await env.DB.prepare('SELECT * FROM users WHERE username = ?')
    .bind(username)
    .first()) as {
    id: string
    username: string
    password_hash: string
    totp_secret: string | null
    created_at: number
  } | null

  const passwordHash = user ? user.password_hash : DUMMY_HASH
  const passwordValid = await bcrypt.compare(password!, passwordHash)
  if (!user || !passwordValid)
    return withCors(env, request, json('Invalid credentials', { status: 401 }))

  // 2FA: TOTP gate. Passkey-only accounts complete the challenge in the
  // public WebAuthn routes.
  if (user.totp_secret) {
    if (!totp_code && !backup_code)
      return withCors(
        env,
        request,
        json({ needs2FA: true, method: 'totp' }, { status: 401 }),
      )
    if (backup_code) {
      const ok = await verifyAndConsumeBackupCode(
        env,
        user.id,
        String(backup_code),
      )
      if (!ok)
        return withCors(
          env,
          request,
          json('Invalid or already-used backup code', { status: 401 }),
        )
    } else {
      const ok = await verifyTOTP(user.totp_secret, String(totp_code))
      if (!ok)
        return withCors(env, request, json('Invalid 2FA code', { status: 401 }))
    }
  } else {
    const pkCount = (await env.DB.prepare(
      'SELECT COUNT(*) as cnt FROM passkeys WHERE user_id = ?',
    )
      .bind(user.id)
      .first()) as { cnt: number } | null
    if ((pkCount?.cnt ?? 0) > 0) {
      return withCors(
        env,
        request,
        json({ needs2FA: true, method: 'passkey' }, { status: 401 }),
      )
    }
  }

  const sessionId = crypto.randomUUID()
  const userAgent = (request.headers.get('User-Agent') ?? 'Unknown').slice(
    0,
    500,
  )
  const ip = clientIp(request) ?? 'unknown'
  await env.DB.prepare(
    'INSERT INTO sessions (id, user_id, device_info, ip) VALUES (?, ?, ?, ?)',
  )
    .bind(sessionId, user.id, userAgent, ip)
    .run()

  const token = await signToken(
    env,
    { sub: user.id, username: user.username, role: 'user', sid: sessionId },
    '7d',
  )
  return withCors(
    env,
    request,
    json({
      token,
      user: { id: user.id, username: user.username, isAdmin: false },
    }),
  )
}

async function verifyAndConsumeBackupCode(
  env: Env,
  userId: string,
  code: string,
): Promise<boolean> {
  const normalized = code.trim().replace(/[-\s]/g, '').toLowerCase()
  const hash = await hmacSha256Hex(jwtSecret(env), normalized)
  const row = (await env.DB.prepare(
    'SELECT id FROM backup_codes WHERE user_id = ? AND code_hash = ? AND used_at IS NULL',
  )
    .bind(userId, hash)
    .first()) as { id: string } | null
  if (!row) return false
  await env.DB.prepare('UPDATE backup_codes SET used_at = ? WHERE id = ?')
    .bind(Math.floor(Date.now() / 1000), row.id)
    .run()
  return true
}

async function hmacSha256Hex(key: string, data: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    new TextEncoder().encode(data),
  )
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function session(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const auth = await verifyAuth(request, env, ctx)
  if (!auth.ok) return withCors(env, request, json({ authenticated: false }))
  return withCors(
    env,
    request,
    json({
      authenticated: true,
      user: {
        id: auth.payload.sub,
        username: auth.payload.username,
        isAdmin: auth.payload.role === 'admin',
      },
    }),
  )
}

async function logout(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const auth = await verifyAuth(request, env, ctx)
  if (auth.ok && auth.payload.sid)
    ctx.waitUntil(
      env.DB.prepare('DELETE FROM sessions WHERE id = ?')
        .bind(auth.payload.sid)
        .run(),
    )
  return withCors(env, request, json({ ok: true }))
}

async function me(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const auth = await verifyAuth(request, env, ctx)
  if (!auth.ok) return auth.response
  return withCors(
    env,
    request,
    json({
      id: auth.payload.sub,
      username: auth.payload.username,
      isAdmin: auth.payload.role === 'admin',
    }),
  )
}

async function updateProfile(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const auth = await verifyAuth(request, env, ctx)
  if (!auth.ok) return auth.response
  const { username } = (await request.json().catch(() => ({}))) as {
    username?: string
  }
  if (!username)
    return withCors(env, request, json('Missing username', { status: 400 }))
  const trimmed = username.trim()
  if (!validateUsername(trimmed))
    return withCors(env, request, json('Invalid username', { status: 400 }))
  const existing = await env.DB.prepare(
    'SELECT id FROM users WHERE username = ?',
  )
    .bind(trimmed)
    .first()
  if (existing && (existing as { id: string }).id !== auth.userId)
    return withCors(env, request, json('Username taken', { status: 409 }))
  await env.DB.prepare('UPDATE users SET username = ? WHERE id = ?')
    .bind(trimmed, auth.userId)
    .run()
  return withCors(env, request, json({ username: trimmed }))
}

async function changePassword(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const auth = await verifyAuth(request, env, ctx)
  if (!auth.ok) return auth.response
  const { currentPassword, newPassword } = (await request
    .json()
    .catch(() => ({}))) as { currentPassword?: string; newPassword?: string }
  const user = (await env.DB.prepare(
    'SELECT password_hash FROM users WHERE id = ?',
  )
    .bind(auth.userId)
    .first()) as { password_hash: string } | null
  const passwordHash = user ? user.password_hash : DUMMY_HASH
  if (!user || !(await bcrypt.compare(currentPassword ?? '', passwordHash)))
    return withCors(env, request, json('Incorrect password', { status: 401 }))
  const passVal = validatePassword(newPassword ?? '')
  if (!passVal.valid)
    return withCors(env, request, json(passVal.error!, { status: 400 }))
  const hashed = await bcrypt.hash(newPassword!, 10)
  await env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
    .bind(hashed, auth.userId)
    .run()
  return withCors(env, request, json({ message: 'Password updated' }))
}

async function deleteMe(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const auth = await verifyAuth(request, env, ctx)
  if (!auth.ok) return auth.response
  const { password, code } = (await request.json().catch(() => ({}))) as {
    password?: string
    code?: string
  }
  const user = (await env.DB.prepare(
    'SELECT password_hash, created_at, totp_secret FROM users WHERE id = ?',
  )
    .bind(auth.userId)
    .first()) as {
    password_hash: string
    created_at: number
    totp_secret: string | null
  } | null
  const passwordHash = user ? user.password_hash : DUMMY_HASH
  if (!user || !(await bcrypt.compare(password ?? '', passwordHash)))
    return withCors(env, request, json('Incorrect password', { status: 401 }))
  if (user.totp_secret && !code)
    return withCors(env, request, json('2FA code required', { status: 400 }))
  if (user.totp_secret && !(await verifyTOTP(user.totp_secret, String(code))))
    return withCors(env, request, json('Invalid 2FA code', { status: 400 }))
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(auth.userId),
    env.DB.prepare('DELETE FROM passkeys WHERE user_id = ?').bind(auth.userId),
    env.DB.prepare('DELETE FROM backup_codes WHERE user_id = ?').bind(
      auth.userId,
    ),
    env.DB.prepare('DELETE FROM users WHERE id = ?').bind(auth.userId),
  ])
  await env.DB.prepare(
    'INSERT INTO deletion_log (reason, user_created_at) VALUES (?, ?)',
  )
    .bind('self', user.created_at)
    .run()
  return withCors(env, request, json({ message: 'Account deleted' }))
}

async function totpSetup(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const auth = await verifyAuth(request, env, ctx)
  if (!auth.ok) return auth.response
  const secret = generateTOTPSecret()
  const label = encodeURIComponent(`garden-console:${auth.payload.username}`)
  const issuer = encodeURIComponent('garden-console')
  const otpauth = `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`
  return withCors(env, request, json({ secret, otpauth }))
}

async function totpVerify(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const auth = await verifyAuth(request, env, ctx)
  if (!auth.ok) return auth.response
  const { secret, code } = (await request.json().catch(() => ({}))) as {
    secret?: string
    code?: string
  }
  if (!secret || !code)
    return withCors(
      env,
      request,
      json('Missing secret or code', { status: 400 }),
    )
  if (!(await verifyTOTP(secret, String(code))))
    return withCors(env, request, json('Invalid 2FA code', { status: 400 }))
  await env.DB.prepare('ALTER TABLE users ADD COLUMN totp_secret TEXT')
    .run()
    .catch(() => {})
  await env.DB.prepare('UPDATE users SET totp_secret = ? WHERE id = ?')
    .bind(secret, auth.userId)
    .run()
  return withCors(env, request, json({ enabled: true }))
}
