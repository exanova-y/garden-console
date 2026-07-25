const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function base32Decode(input: string): Uint8Array {
  const clean = input.toUpperCase().replace(/\s/g, '').replace(/=+$/, '')
  const bytes: number[] = []
  let buf = 0
  let bitsLeft = 0
  for (let i = 0; i < clean.length; i++) {
    const val = BASE32_CHARS.indexOf(clean[i])
    if (val < 0) throw new Error(`Invalid base32 char: ${clean[i]}`)
    buf = (buf << 5) | val
    bitsLeft += 5
    if (bitsLeft >= 8) {
      bitsLeft -= 8
      bytes.push((buf >> bitsLeft) & 0xff)
    }
  }
  return new Uint8Array(bytes)
}

export function base32Encode(bytes: Uint8Array): string {
  let result = ''
  let buf = 0
  let bitsLeft = 0
  for (const byte of bytes) {
    buf = (buf << 8) | byte
    bitsLeft += 8
    while (bitsLeft >= 5) {
      bitsLeft -= 5
      result += BASE32_CHARS[(buf >> bitsLeft) & 0x1f]
    }
  }
  if (bitsLeft > 0) result += BASE32_CHARS[(buf << (5 - bitsLeft)) & 0x1f]
  return result
}

export function generateTOTPSecret(): string {
  const bytes = new Uint8Array(20)
  crypto.getRandomValues(bytes)
  return base32Encode(bytes)
}

async function hotp(secret: string, counter: number): Promise<string> {
  const keyBytes = base32Decode(secret)
  const counterBuf = new ArrayBuffer(8)
  const view = new DataView(counterBuf)
  view.setUint32(0, Math.floor(counter / 0x100000000), false)
  view.setUint32(4, counter % 0x100000000, false)
  // TS 7's generic Uint8Array<ArrayBufferLike> isn't assignable to workers'
  // BufferSource; copy into a freshly-owned ArrayBuffer.
  const keyBuf = new Uint8Array(keyBytes) as unknown as ArrayBuffer
  const key = await crypto.subtle.importKey(
    'raw',
    keyBuf,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, counterBuf)
  const hmac = new Uint8Array(sig)
  const offset = hmac[hmac.length - 1] & 0x0f
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3]
  return (code % 1_000_000).toString().padStart(6, '0')
}

export async function verifyTOTP(
  secret: string,
  token: string,
  windowSize = 1,
): Promise<boolean> {
  if (!/^\d{6}$/.test(token)) return false
  const T = Math.floor(Date.now() / 1000 / 30)
  for (let i = -windowSize; i <= windowSize; i++) {
    if ((await hotp(secret, T + i)) === token) return true
  }
  return false
}
