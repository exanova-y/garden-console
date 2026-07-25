// Worker environment bindings. D1/R2 bindings are added in wrangler.toml once
// the Cloudflare resources exist; the types compile against
// @cloudflare/workers-types regardless of whether the binding is present.

export interface Env {
  ASSETS: Fetcher
  DB: D1Database
  JWT_SECRET: string
  ALLOWED_ORIGIN?: string
  ADMIN_USERNAME?: string
  ADMIN_PASSWORD?: string
}
