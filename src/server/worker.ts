import type { Env } from './env'
import { handleIdentity } from '../features/identity'
import { handleVault, handlePasskeys } from '../features/vault'

function json(data: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers)
  headers.set('Content-Type', 'application/json; charset=utf-8')
  headers.set('Cache-Control', 'no-store')
  return new Response(JSON.stringify(data), { ...init, headers })
}

const IDENTITY_PATHS = new Set([
  '/api/login',
  '/api/register',
  '/api/session',
  '/api/logout',
])

const PASSKEY_AUTH_PATHS = new Set([
  '/api/auth/passkey-options',
  '/api/auth/passkey-verify',
])

const PASSKEY_MANAGE_PATHS = new Set([
  '/api/auth/passkey-register',
  '/api/auth/passkey-register-verify',
])

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname

    if (path === '/api/health' && request.method === 'GET')
      return json({ status: 'ok', service: 'garden-console' })

    // Identity routes (register, login, session, logout, user/*).
    if (
      IDENTITY_PATHS.has(path) ||
      path.startsWith('/api/user') ||
      path === '/api/auth/totp-setup' ||
      path === '/api/auth/totp-verify'
    )
      return handleIdentity(request, env, ctx)

    // Passkey assertion (public login).
    if (PASSKEY_AUTH_PATHS.has(path)) return handlePasskeys(request, env, ctx)

    // Passkey registration (authenticated).
    if (PASSKEY_MANAGE_PATHS.has(path)) return handlePasskeys(request, env, ctx)

    // Vault content CRUD.
    if (path === '/api/content' || path.startsWith('/api/content/'))
      return handleVault(request, env, ctx)

    if (path.startsWith('/api/'))
      return json({ error: 'Not found' }, { status: 404 })

    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>
