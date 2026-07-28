import { verifyAuth } from './routes'
import { checkRateLimit } from '../identity/rate-limit'
import { validateJWTSecret } from '../identity/validation'
import type { Env } from '../../../../server/env'

// --- Minimal CBOR decoder (covers WebAuthn EC P-256 COSE keys) ---

function decodeCBOR(bytes: Uint8Array): any {
  let offset = 0
  function readLen(info: number): number {
    if (info < 24) return info
    if (info === 24) return bytes[offset++]
    if (info === 25) {
      const v = (bytes[offset] << 8) | bytes[offset + 1]
      offset += 2
      return v
    }
    if (info === 26) {
      const v =
        ((bytes[offset] << 24) |
          (bytes[offset + 1] << 16) |
          (bytes[offset + 2] << 8) |
          bytes[offset + 3]) >>>
        0
      offset += 4
      return v
    }
    throw new Error('CBOR: unsupported length info ' + info)
  }
  function readValue(): any {
    const b = bytes[offset++]
    const major = b >> 5
    const info = b & 0x1f
    if (major === 0) return readLen(info)
    if (major === 1) return -1 - readLen(info)
    if (major === 2) {
      const len = readLen(info)
      const sl = bytes.slice(offset, offset + len)
      offset += len
      return sl
    }
    if (major === 3) {
      const len = readLen(info)
      const sl = bytes.slice(offset, offset + len)
      offset += len
      return new TextDecoder().decode(sl)
    }
    if (major === 4) {
      const len = readLen(info)
      return Array.from({ length: len }, () => readValue())
    }
    if (major === 5) {
      const len = readLen(info)
      const map: any = {}
      for (let i = 0; i < len; i++) {
        const k = readValue()
        map[k] = readValue()
      }
      return map
    }
    if (major === 7) {
      if (info === 20) return false
      if (info === 21) return true
      if (info === 22) return null
    }
    throw new Error('CBOR: unsupported major ' + major)
  }
  return readValue()
}

// --- Base64url helpers ---

function b64urlDecode(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  const pad = (4 - (b64.length % 4)) % 4
  const decoded = atob(b64 + '='.repeat(pad))
  const arr = new Uint8Array(decoded.length)
  for (let i = 0; i < arr.length; i++) arr[i] = decoded.charCodeAt(i)
  return arr
}

function buf(u: Uint8Array): ArrayBuffer {
  return u.buffer.slice(
    u.byteOffset,
    u.byteOffset + u.byteLength,
  ) as ArrayBuffer
}

function b64urlEncode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

// --- AuthData parser ---

interface ParsedAuthData {
  rpIdHash: Uint8Array
  flags: number
  signCount: number
  credentialId?: Uint8Array
  publicKeyX?: Uint8Array
  publicKeyY?: Uint8Array
}

function parseAuthData(auth: Uint8Array): ParsedAuthData {
  const rpIdHash = auth.slice(0, 32)
  const flags = auth[32]
  const signCount =
    ((auth[33] << 24) | (auth[34] << 16) | (auth[35] << 8) | auth[36]) >>> 0
  let credentialId: Uint8Array | undefined
  let publicKeyX: Uint8Array | undefined
  let publicKeyY: Uint8Array | undefined
  if (flags & 0x40) {
    let off = 37 + 16 // rpIdHash(32) + flags(1) + signCount(4) + AAGUID(16)
    const credIdLen = (auth[off] << 8) | auth[off + 1]
    off += 2
    credentialId = auth.slice(off, off + credIdLen)
    off += credIdLen
    const coseKey = decodeCBOR(auth.slice(off))
    if (coseKey[-2] instanceof Uint8Array) publicKeyX = coseKey[-2]
    if (coseKey[-3] instanceof Uint8Array) publicKeyY = coseKey[-3]
  }
  return { rpIdHash, flags, signCount, credentialId, publicKeyX, publicKeyY }
}

// --- DER → raw signature for ECDSA ---

function derSigToRaw(der: Uint8Array): Uint8Array {
  if (der[0] !== 0x30) throw new Error('Not a DER sequence')
  let pos = 2
  if (der[pos++] !== 0x02) throw new Error('Expected r INTEGER')
  const rLen = der[pos++]
  let r = der.slice(pos, pos + rLen)
  pos += rLen
  if (der[pos++] !== 0x02) throw new Error('Expected s INTEGER')
  const sLen = der[pos++]
  let s = der.slice(pos, pos + sLen)
  if (r[0] === 0) r = r.slice(1)
  if (s[0] === 0) s = s.slice(1)
  const raw = new Uint8Array(64)
  raw.set(r, 32 - r.length)
  raw.set(s, 64 - s.length)
  return raw
}

async function verifyPasskeyAssertion(
  clientDataJSONb64: string,
  authenticatorDatab64: string,
  signatureb64: string,
  storedX: string,
  storedY: string,
  storedCounter: number,
  expectedOrigin: string,
  expectedRpId: string,
  expectedChallenge: string,
): Promise<number> {
  const clientData = JSON.parse(
    new TextDecoder().decode(b64urlDecode(clientDataJSONb64)),
  )
  if (clientData.type !== 'webauthn.get') throw new Error('Wrong type')
  const received = clientData.challenge
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
  if (received !== expectedChallenge.replace(/=/g, ''))
    throw new Error('Challenge mismatch')
  if (clientData.origin !== expectedOrigin) throw new Error('Origin mismatch')

  const authBytes = b64urlDecode(authenticatorDatab64)
  const { rpIdHash, flags, signCount } = parseAuthData(authBytes)
  const rpHash = new Uint8Array(
    await crypto.subtle.digest(
      'SHA-256',
      buf(new TextEncoder().encode(expectedRpId)),
    ),
  )
  if (!rpIdHash.every((v, i) => v === rpHash[i]))
    throw new Error('RP ID mismatch')
  if (!(flags & 1)) throw new Error('User presence not set')

  const clientHash = new Uint8Array(
    await crypto.subtle.digest('SHA-256', buf(b64urlDecode(clientDataJSONb64))),
  )
  const sigBase = new Uint8Array(authBytes.length + clientHash.length)
  sigBase.set(authBytes)
  sigBase.set(clientHash, authBytes.length)

  const x = b64urlDecode(storedX)
  const y = b64urlDecode(storedY)
  const uncompressed = new Uint8Array(65)
  uncompressed[0] = 0x04
  uncompressed.set(x, 1)
  uncompressed.set(y, 33)
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    uncompressed,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  )

  const rawSig = derSigToRaw(b64urlDecode(signatureb64))
  const valid = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    cryptoKey,
    buf(rawSig),
    buf(sigBase),
  )
  if (!valid) throw new Error('Signature invalid')
  if (storedCounter > 0 && signCount > 0 && storedCounter >= signCount)
    throw new Error('Counter not advancing (cloned authenticator?)')
  return signCount
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

let passkeysEnsured = false
async function ensurePasskeys(env: Env): Promise<void> {
  if (passkeysEnsured) return
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS passkeys (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      credential_id TEXT NOT NULL UNIQUE,
      public_key_x TEXT NOT NULL,
      public_key_y TEXT NOT NULL,
      counter INTEGER DEFAULT 0,
      device_name TEXT,
      created_at INTEGER DEFAULT (unixepoch()),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`,
  ).run()
  await env.DB.prepare(
    'CREATE INDEX IF NOT EXISTS idx_passkeys_user_id ON passkeys(user_id)',
  ).run()
  await env.DB.prepare(
    'CREATE INDEX IF NOT EXISTS idx_passkeys_cred_id ON passkeys(credential_id)',
  ).run()
  passkeysEnsured = true
}

import { SignJWT, jwtVerify } from 'jose'

export async function handlePasskeys(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const url = new URL(request.url)
  const path = url.pathname

  if (request.method === 'OPTIONS')
    return withCors(env, request, new Response(null, { status: 204 }))

  await ensurePasskeys(env)
  const secret = new TextEncoder().encode(validateJWTSecret(env.JWT_SECRET))

  // --- Registration: begin ---

  if (path === '/api/auth/passkey-register' && request.method === 'POST') {
    const auth = await verifyAuth(request, env, ctx)
    if (!auth.ok) return auth.response

    const user = (await env.DB.prepare('SELECT * FROM users WHERE id = ?')
      .bind(auth.userId)
      .first()) as { id: string; username: string } | null
    if (!user)
      return withCors(env, request, json('User not found', { status: 404 }))

    const challenge = b64urlEncode(crypto.getRandomValues(new Uint8Array(32)))
    const origin = request.headers.get('Origin') ?? `https://${url.hostname}`
    const challengeToken = await new SignJWT({
      challenge,
      purpose: 'passkey-register',
      origin,
      userId: auth.userId,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('5m')
      .sign(secret)

    // Exclude existing credential IDs so the authenticator creates a new one.
    const rows = await env.DB.prepare(
      'SELECT credential_id FROM passkeys WHERE user_id = ?',
    )
      .bind(auth.userId)
      .all()
    const excludeCredentials = (rows.results || []).map((r: any) => ({
      id: r.credential_id,
      type: 'public-key',
      transports: ['internal', 'hybrid'],
    }))

    return withCors(
      env,
      request,
      json({
        challengeToken,
        challenge,
        user: {
          id: auth.userId,
          name: user.username,
          displayName: user.username,
        },
        excludeCredentials,
        rp: { name: 'garden-console', id: url.hostname },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 }, // ES256
          { type: 'public-key', alg: -257 }, // RS256
        ],
        authenticatorSelection: {
          residentKey: 'preferred',
          userVerification: 'preferred',
        },
      }),
    )
  }

  // --- Registration: verify ---

  if (
    path === '/api/auth/passkey-register-verify' &&
    request.method === 'POST'
  ) {
    const auth = await verifyAuth(request, env, ctx)
    if (!auth.ok) return auth.response

    const { challengeToken, credential } = (await request
      .json()
      .catch(() => ({}))) as { challengeToken?: string; credential?: any }
    if (!challengeToken || !credential?.id || !credential?.response)
      return withCors(env, request, json('Missing data', { status: 400 }))

    let challengePayload: any
    try {
      const { payload } = await jwtVerify(challengeToken, secret)
      challengePayload = payload
    } catch {
      return withCors(
        env,
        request,
        json('Invalid or expired challenge', { status: 400 }),
      )
    }
    if (challengePayload.purpose !== 'passkey-register')
      return withCors(
        env,
        request,
        json('Invalid challenge purpose', { status: 400 }),
      )
    if (challengePayload.userId !== auth.userId)
      return withCors(env, request, json('User mismatch', { status: 400 }))

    const expectedOrigin = challengePayload.origin as string
    const expectedRpId = (() => {
      try {
        return new URL(expectedOrigin).hostname
      } catch {
        return url.hostname
      }
    })()

    try {
      const clientData = JSON.parse(
        new TextDecoder().decode(
          b64urlDecode(credential.response.clientDataJSON),
        ),
      )
      if (clientData.type !== 'webauthn.create') throw new Error('Wrong type')
      const receivedChallenge = clientData.challenge
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '')
      if (receivedChallenge !== challengePayload.challenge.replace(/=/g, ''))
        throw new Error('Challenge mismatch')
      if (clientData.origin !== expectedOrigin)
        throw new Error('Origin mismatch')

      const attestation = decodeCBOR(
        b64urlDecode(credential.response.attestationObject),
      )
      const authData = attestation.authData as Uint8Array
      if (!(authData instanceof Uint8Array))
        throw new Error('Missing authenticator data')
      const { flags, signCount, credentialId, publicKeyX, publicKeyY } =
        parseAuthData(authData)
      const rpHash = new Uint8Array(
        await crypto.subtle.digest(
          'SHA-256',
          buf(new TextEncoder().encode(expectedRpId)),
        ),
      )
      if (!rpHash.every((value, index) => value === authData[index]))
        throw new Error('RP ID mismatch')
      if (!(flags & 0x40))
        throw new Error('Attested credential data not present')
      if (!credentialId || !publicKeyX || !publicKeyY)
        throw new Error('Missing credential data')

      const credIdB64 = b64urlEncode(credentialId)
      const existing = await env.DB.prepare(
        'SELECT id FROM passkeys WHERE credential_id = ?',
      )
        .bind(credIdB64)
        .first()
      if (existing)
        return withCors(
          env,
          request,
          json('Passkey already registered', { status: 409 }),
        )

      await env.DB.prepare(
        'INSERT INTO passkeys (id, user_id, credential_id, public_key_x, public_key_y, counter, device_name) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
        .bind(
          crypto.randomUUID(),
          auth.userId,
          credIdB64,
          b64urlEncode(publicKeyX),
          b64urlEncode(publicKeyY),
          signCount,
          (request.headers.get('User-Agent') ?? 'Unknown').slice(0, 200),
        )
        .run()

      return withCors(
        env,
        request,
        json({ message: 'Passkey registered' }, { status: 201 }),
      )
    } catch (e) {
      return withCors(
        env,
        request,
        json(`Registration failed: ${(e as Error).message}`, { status: 400 }),
      )
    }
  }

  // --- Assertion: begin (public, no JWT) ---

  if (path === '/api/auth/passkey-options' && request.method === 'POST') {
    const ip =
      (await Promise.resolve(
        request.headers.get('CF-Connecting-IP') ??
          request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ??
          'unknown',
      )) ?? 'unknown'
    if (!(await checkRateLimit(env.DB, `passkey-options:${ip}`, 10, 60_000)))
      return withCors(
        env,
        request,
        json('Too many requests', {
          status: 429,
          headers: { 'Retry-After': '60' },
        }),
      )

    const { username } = (await request.json().catch(() => ({}))) as {
      username?: string
    }
    const origin = request.headers.get('Origin') ?? `https://${url.hostname}`
    const challenge = b64urlEncode(crypto.getRandomValues(new Uint8Array(32)))

    let credentialIds: string[] = []
    if (username) {
      const userRow = (await env.DB.prepare(
        'SELECT id FROM users WHERE username = ?',
      )
        .bind(String(username).trim())
        .first()) as { id: string } | null
      if (userRow) {
        const rows = await env.DB.prepare(
          'SELECT credential_id FROM passkeys WHERE user_id = ?',
        )
          .bind(userRow.id)
          .all()
        credentialIds = (rows.results || []).map((r: any) => r.credential_id)
      }
    }

    const challengeToken = await new SignJWT({
      challenge,
      purpose: 'passkey-auth',
      origin,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('5m')
      .sign(secret)

    return withCors(
      env,
      request,
      json({ challengeToken, challenge, credentialIds }),
    )
  }

  // --- Assertion: verify (public, no JWT) ---

  if (path === '/api/auth/passkey-verify' && request.method === 'POST') {
    const ip =
      (await Promise.resolve(
        request.headers.get('CF-Connecting-IP') ??
          request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ??
          'unknown',
      )) ?? 'unknown'
    if (!(await checkRateLimit(env.DB, `passkey-verify:${ip}`, 10, 60_000)))
      return withCors(
        env,
        request,
        json('Too many requests', {
          status: 429,
          headers: { 'Retry-After': '60' },
        }),
      )

    const { challengeToken, credential } = (await request
      .json()
      .catch(() => ({}))) as { challengeToken?: string; credential?: any }
    if (!challengeToken || !credential?.id || !credential?.response)
      return withCors(env, request, json('Missing data', { status: 400 }))

    let challengePayload: any
    try {
      const { payload } = await jwtVerify(challengeToken, secret)
      challengePayload = payload
    } catch {
      return withCors(
        env,
        request,
        json('Invalid or expired challenge', { status: 400 }),
      )
    }
    if (challengePayload.purpose !== 'passkey-auth')
      return withCors(
        env,
        request,
        json('Invalid challenge purpose', { status: 400 }),
      )

    const passkeyRow = (await env.DB.prepare(
      'SELECT * FROM passkeys WHERE credential_id = ?',
    )
      .bind(credential.id as string)
      .first()) as any
    if (!passkeyRow)
      return withCors(env, request, json('Passkey not found', { status: 401 }))

    const userRow = (await env.DB.prepare('SELECT * FROM users WHERE id = ?')
      .bind(passkeyRow.user_id)
      .first()) as any
    if (!userRow)
      return withCors(env, request, json('User not found', { status: 401 }))

    const expectedOrigin = challengePayload.origin as string
    const expectedRpId = (() => {
      try {
        return new URL(expectedOrigin).hostname
      } catch {
        return url.hostname
      }
    })()

    try {
      const newCounter = await verifyPasskeyAssertion(
        credential.response.clientDataJSON,
        credential.response.authenticatorData,
        credential.response.signature,
        passkeyRow.public_key_x,
        passkeyRow.public_key_y,
        passkeyRow.counter,
        expectedOrigin,
        expectedRpId,
        challengePayload.challenge,
      )
      await env.DB.prepare('UPDATE passkeys SET counter = ? WHERE id = ?')
        .bind(newCounter, passkeyRow.id)
        .run()
    } catch {
      return withCors(
        env,
        request,
        json('Passkey verification failed', { status: 401 }),
      )
    }

    // Issue session.
    const sessionId = crypto.randomUUID()
    const userAgent = (request.headers.get('User-Agent') ?? 'Unknown').slice(
      0,
      500,
    )
    const loginIP = ip
    await env.DB.prepare(
      'INSERT INTO sessions (id, user_id, device_info, ip) VALUES (?, ?, ?, ?)',
    )
      .bind(sessionId, userRow.id, userAgent, loginIP)
      .run()

    const jwtToken = await new SignJWT({
      sub: userRow.id,
      username: userRow.username,
      role: 'user',
      sid: sessionId,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(secret)

    return withCors(
      env,
      request,
      json({
        token: jwtToken,
        user: {
          id: userRow.id,
          username: userRow.username,
          isAdmin: false,
        },
      }),
    )
  }

  return withCors(env, request, json('Not found', { status: 404 }))
}
