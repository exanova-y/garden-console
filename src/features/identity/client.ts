import {
  decryptCloudPayload,
  deriveCloudKey,
  encryptCloudPayload,
  isCloudEncrypted,
} from '../vault/crypto'

export interface ClientUser {
  id: string
  username: string
  isAdmin: boolean
}

interface AuthResponse {
  token: string
  user: ClientUser
}

export class ApiError extends Error {
  status: number
  body: unknown

  constructor(status: number, body: unknown) {
    super(typeof body === 'string' ? body : `Request failed (${status})`)
    this.status = status
    this.body = body
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })
  const text = await response.text()
  let body: unknown = text
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    // Keep a plain-text error body.
  }
  if (!response.ok) throw new ApiError(response.status, body)
  return body as T
}

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` }
}

export async function register(
  username: string,
  password: string,
): Promise<AuthResponse> {
  return request<AuthResponse>('/api/register', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

export async function login(
  username: string,
  password: string,
  totpCode?: string,
): Promise<AuthResponse> {
  return request<AuthResponse>('/api/login', {
    method: 'POST',
    body: JSON.stringify({
      username,
      password,
      ...(totpCode ? { totp_code: totpCode } : {}),
    }),
  })
}

export async function session(token: string): Promise<{
  authenticated: boolean
  user?: ClientUser
}> {
  return request('/api/session', { headers: authHeaders(token) })
}

export async function saveEncryptedBackup(
  token: string,
  payload: unknown,
): Promise<void> {
  const key = localStorage.getItem('enc_key')
  if (!key) throw new Error('Unlock with your password before syncing.')
  const envelope = await encryptCloudPayload(JSON.stringify(payload), key)
  await request('/api/content', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ data: envelope }),
  })
}

export async function loadLatestEncryptedBackup(
  token: string,
): Promise<unknown | null> {
  const key = localStorage.getItem('enc_key')
  if (!key) throw new Error('Unlock with your password before syncing.')
  const response = await request<Array<{ data: string }>>('/api/content', {
    headers: authHeaders(token),
  })
  const latest = response[0]
  if (!latest) return null
  const envelope = JSON.parse(latest.data) as unknown
  if (!isCloudEncrypted(envelope)) throw new Error('Invalid encrypted backup.')
  const plaintext = await decryptCloudPayload(envelope, key)
  if (!plaintext) throw new Error('Could not decrypt backup.')
  return JSON.parse(plaintext)
}

export async function establishCloudKey(
  password: string,
  userId: string,
): Promise<void> {
  localStorage.setItem('enc_key', await deriveCloudKey(password, userId))
}

export function clearClientAuth(): void {
  localStorage.removeItem('auth_token')
  localStorage.removeItem('auth_user')
  localStorage.removeItem('enc_key')
}
