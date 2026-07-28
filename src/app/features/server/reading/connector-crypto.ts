import type { Env } from '../../../../server/env'

function encode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
}

function decode(value: string): Uint8Array<ArrayBuffer> {
  const raw = atob(value)
  const bytes = new Uint8Array(raw.length)
  for (let index = 0; index < raw.length; index++)
    bytes[index] = raw.charCodeAt(index)
  return bytes
}

async function connectorKey(env: Env): Promise<CryptoKey> {
  const secret = env.CONNECTOR_ENCRYPTION_KEY
  if (!secret || secret.length < 32)
    throw new Error('CONNECTOR_ENCRYPTION_KEY must be at least 32 characters')
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(secret) as unknown as ArrayBuffer,
  )
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ])
}

export async function encryptConnectorToken(
  env: Env,
  value: string,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as ArrayBuffer },
    await connectorKey(env),
    new TextEncoder().encode(value) as unknown as ArrayBuffer,
  )
  return JSON.stringify({
    iv: encode(iv),
    data: encode(new Uint8Array(encrypted)),
  })
}

export async function decryptConnectorToken(
  env: Env,
  value: string,
): Promise<string> {
  const envelope = JSON.parse(value) as { iv: string; data: string }
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: decode(envelope.iv) as unknown as ArrayBuffer },
    await connectorKey(env),
    decode(envelope.data) as unknown as ArrayBuffer,
  )
  return new TextDecoder().decode(decrypted)
}
