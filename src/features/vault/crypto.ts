/**
 * Client-side encryption for cloud backups.
 *
 * Key derivation: PBKDF2-SHA256, 210000 iterations, 256-bit output.
 * Cipher: AES-GCM, random 12-byte IV, 128-bit tag.
 *
 * The envelope stored on the server is:
 *   { v: 1, iv: base64, salt: base64, data: base64 }
 *
 * The server never sees plaintext. If no key is available, save MUST fail.
 */

const PBKDF2_ITERATIONS = 210_000
const KEY_LENGTH_BITS = 256
const SALT_LENGTH = 16
const IV_LENGTH = 12

function b64encode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
}

function b64decode(s: string): Uint8Array<ArrayBuffer> {
  const arr = new Uint8Array(atob(s).length)
  for (let i = 0; i < arr.length; i++) arr[i] = atob(s).charCodeAt(i)
  return arr
}

/** Returns the ArrayBuffer backing a Uint8Array, copying if necessary. */
function buf(u: Uint8Array): ArrayBuffer {
  return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer
}

function b64urlDecode(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  const pad = (4 - (b64.length % 4)) % 4
  return Uint8Array.from(atob(b64 + '='.repeat(pad)), (c) => c.charCodeAt(0))
}

function b64urlEncode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

export async function deriveCloudKey(
  password: string,
  userId: string,
): Promise<string> {
  const enc = new TextEncoder()
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    buf(enc.encode(password)),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  const salt = enc.encode(`garden-console:${userId}`)
  const derived = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    passwordKey,
    { name: 'AES-GCM', length: KEY_LENGTH_BITS },
    true,
    ['encrypt', 'decrypt'],
  )
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', derived))
  return b64encode(raw)
}

export interface EncryptedEnvelope {
  v: 1
  iv: string
  salt: string
  data: string
}

export function isCloudEncrypted(value: unknown): value is EncryptedEnvelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    'v' in value &&
    (value as { v: unknown }).v === 1 &&
    'iv' in value &&
    'salt' in value &&
    'data' in value
  )
}

export async function encryptCloudPayload(
  plaintext: string,
  keyBase64: string,
): Promise<EncryptedEnvelope> {
  const rawKey = b64decode(keyBase64)
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    buf(rawKey),
    { name: 'AES-GCM' },
    false,
    ['encrypt'],
  )
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH))
  const encoded = new TextEncoder().encode(plaintext)
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    encoded,
  )
  return {
    v: 1,
    iv: b64encode(iv),
    salt: b64encode(salt),
    data: b64encode(new Uint8Array(ciphertext)),
  }
}

export async function decryptCloudPayload(
  envelope: EncryptedEnvelope,
  keyBase64: string,
): Promise<string | null> {
  try {
    const rawKey = b64decode(keyBase64)
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      buf(rawKey),
      { name: 'AES-GCM' },
      false,
      ['decrypt'],
    )
    const iv = b64decode(envelope.iv)
    const ciphertext = b64decode(envelope.data)
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      ciphertext,
    )
    return new TextDecoder().decode(decrypted)
  } catch {
    return null
  }
}
