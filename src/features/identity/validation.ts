// Minimum/maximum lengths chosen to match the upstream tracker so existing
// accounts migrate cleanly.

export const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,30}$/

export const MIN_PASSWORD_LENGTH = 8
export const MAX_PASSWORD_LENGTH = 128

export const SESSION_IDLE_TIMEOUT_SECONDS = 3 * 24 * 60 * 60 // 3 days

export function validateUsername(username: string): boolean {
  return USERNAME_REGEX.test(username)
}

export function validatePassword(password: string): {
  valid: boolean
  error?: string
} {
  if (password.length < MIN_PASSWORD_LENGTH)
    return {
      valid: false,
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long`,
    }
  if (password.length > MAX_PASSWORD_LENGTH)
    return {
      valid: false,
      error: `Password must be at most ${MAX_PASSWORD_LENGTH} characters long`,
    }
  return { valid: true }
}

const WEAK_SECRETS = new Set([
  'secret',
  'fallback-secret',
  'fallback_secret',
  'test-secret',
  'dev-secret',
  'default',
  'password',
  '123456',
  'changeme',
])

export function validateJWTSecret(secret: string | undefined): string {
  if (!secret) throw new Error('JWT_SECRET environment variable must be set.')
  if (secret.length < 32)
    throw new Error('JWT_SECRET must be at least 32 characters long.')
  const lower = secret.toLowerCase()
  for (const weak of WEAK_SECRETS) {
    if (lower.includes(weak))
      throw new Error(`JWT_SECRET contains weak pattern "${weak}".`)
  }
  return secret
}

/** Constant-time string comparison for short credentials. */
export function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder()
  const aBytes = enc.encode(a)
  const bBytes = enc.encode(b)
  const TARGET_LEN = 512
  const aFixed = new Uint8Array(TARGET_LEN)
  const bFixed = new Uint8Array(TARGET_LEN)
  aFixed.set(aBytes.slice(0, TARGET_LEN))
  bFixed.set(bBytes.slice(0, TARGET_LEN))
  let result = 0
  for (let i = 0; i < TARGET_LEN; i++) result |= aFixed[i] ^ bFixed[i]
  return (
    result === 0 &&
    aBytes.length === bBytes.length &&
    aBytes.length <= TARGET_LEN
  )
}
