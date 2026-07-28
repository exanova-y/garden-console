import { verifyAuth } from '../vault/routes'
import type { Env } from '../../../../server/env'
import {
  beginOAuth,
  finishOAuth,
  pollConnectors,
  type Provider,
} from './connectors'
import { READING_LIST } from './reading-list'
import { json } from './response'
import { fetchCommunityItems } from './sources'

async function requireOwner(request: Request, env: Env, ctx: ExecutionContext) {
  const auth = await verifyAuth(request, env, ctx)
  if (!auth.ok) return auth
  if (auth.payload.role !== 'admin')
    return { ok: false as const, response: json('Owner only', { status: 403 }) }
  return auth
}

export async function handleReading(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const url = new URL(request.url)
  const path = url.pathname

  if (path === '/api/reading/community-sources' && request.method === 'GET')
    return json(READING_LIST)

  if (path === '/api/reading/community-source' && request.method === 'GET') {
    const sourceId = url.searchParams.get('id') ?? ''
    try {
      return json(await fetchCommunityItems(sourceId))
    } catch (error) {
      return json((error as Error).message, { status: 400 })
    }
  }

  if (path === '/api/reading/items' && request.method === 'GET') {
    const provider = url.searchParams.get('provider')
    const limit = Math.min(
      200,
      Math.max(1, Number(url.searchParams.get('limit')) || 100),
    )
    const query = provider
      ? env.DB.prepare(
          'SELECT * FROM reading_items WHERE provider = ? ORDER BY COALESCE(published_at, received_at) DESC LIMIT ?',
        ).bind(provider, limit)
      : env.DB.prepare(
          'SELECT * FROM reading_items ORDER BY COALESCE(published_at, received_at) DESC LIMIT ?',
        ).bind(limit)
    const rows = await query.all()
    return json(rows.results)
  }

  if (path === '/api/reading/connectors' && request.method === 'GET') {
    const rows = await env.DB.prepare(
      'SELECT provider, account_label, status, last_sync_at FROM reading_connectors ORDER BY provider',
    ).all()
    return json(rows.results)
  }

  const callback = path.match(
    /^\/api\/reading\/oauth\/(google|feedly)\/callback$/,
  )
  if (callback && request.method === 'GET')
    return finishOAuth(callback[1] as Provider, request, env)

  const owner = await requireOwner(request, env, ctx)
  if (!owner.ok) return owner.response

  const connect = path.match(
    /^\/api\/reading\/connect\/(google|feedly)\/start$/,
  )
  if (connect && request.method === 'POST')
    return beginOAuth(connect[1] as Provider, request, env)

  if (path === '/api/reading/poll-connectors' && request.method === 'POST')
    return json(await pollConnectors(env))

  const remove = path.match(/^\/api\/reading\/connectors\/(google|feedly)$/)
  if (remove && request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM reading_connectors WHERE provider = ?')
      .bind(remove[1])
      .run()
    return json({ removed: remove[1] })
  }

  return json('Not found', { status: 404 })
}
