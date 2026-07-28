import type { D1Database } from '@cloudflare/workers-types'

interface RateLimitRecord {
  count: number
  reset_time: number
}

let ensured = false

export async function ensureRateLimitTable(db: D1Database): Promise<void> {
  if (ensured) return
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS rate_limits (
        key TEXT PRIMARY KEY,
        count INTEGER NOT NULL,
        reset_time INTEGER NOT NULL
      )`,
    )
    .run()
  ensured = true
}

/**
 * D1-backed token-bucket-ish limiter. Returns true if the request is allowed.
 * Fails open on DB errors — never lock every user out due to an infra hiccup.
 */
export async function checkRateLimit(
  db: D1Database,
  key: string,
  maxRequests = 5,
  windowMs = 60_000,
): Promise<boolean> {
  await ensureRateLimitTable(db)
  const now = Date.now()
  try {
    const record = (await db
      .prepare('SELECT count, reset_time FROM rate_limits WHERE key = ?')
      .bind(key)
      .first()) as RateLimitRecord | null

    if (!record || now > record.reset_time) {
      await db
        .prepare(
          'INSERT INTO rate_limits (key, count, reset_time) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = 1, reset_time = excluded.reset_time',
        )
        .bind(key, now + windowMs)
        .run()
      if (Math.random() < 0.05)
        await db
          .prepare('DELETE FROM rate_limits WHERE reset_time < ?')
          .bind(now)
          .run()
      return true
    }
    if (record.count >= maxRequests) return false
    await db
      .prepare('UPDATE rate_limits SET count = count + 1 WHERE key = ?')
      .bind(key)
      .run()
    return true
  } catch (e) {
    console.error('Rate limit check failed:', e)
    return true
  }
}
