import type { Env } from '../../../../../server/env'
import {
  decryptConnectorToken,
  encryptConnectorToken,
} from '../connector-crypto'
import { json } from '../response'

export type Provider = 'google' | 'feedly'

interface ConnectorRow {
  provider: Provider
  account_label: string | null
  access_token_enc: string | null
  refresh_token_enc: string | null
  expires_at: number | null
  status: string
}

function b64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

async function challenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(verifier) as unknown as ArrayBuffer,
  )
  return b64url(new Uint8Array(digest))
}

function providerConfig(provider: Provider, env: Env) {
  if (provider === 'google') {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET)
      throw new Error('Google connector is not configured')
    return {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
      token: 'https://oauth2.googleapis.com/token',
      scope: 'openid email https://www.googleapis.com/auth/gmail.readonly',
    }
  }
  if (!env.FEEDLY_CLIENT_ID || !env.FEEDLY_CLIENT_SECRET)
    throw new Error('Feedly connector is not configured')
  return {
    clientId: env.FEEDLY_CLIENT_ID,
    clientSecret: env.FEEDLY_CLIENT_SECRET,
    authorize: 'https://cloud.feedly.com/v3/auth/auth',
    token: 'https://cloud.feedly.com/v3/auth/token',
    scope: 'https://cloud.feedly.com/subscriptions',
  }
}

function publicOrigin(request: Request, env: Env): string {
  return env.PUBLIC_ORIGIN ?? new URL(request.url).origin
}

export async function beginOAuth(
  provider: Provider,
  request: Request,
  env: Env,
): Promise<Response> {
  const config = providerConfig(provider, env)
  const state = b64url(crypto.getRandomValues(new Uint8Array(24)))
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)))
  const redirectUri = `${publicOrigin(request, env)}/api/reading/oauth/${provider}/callback`
  await env.DB.prepare(
    'INSERT INTO reading_oauth_states (state, provider, verifier, redirect_uri, expires_at) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(state, provider, verifier, redirectUri, Date.now() + 10 * 60_000)
    .run()

  const url = new URL(config.authorize)
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', config.scope)
  url.searchParams.set('state', state)
  url.searchParams.set('code_challenge', await challenge(verifier))
  url.searchParams.set('code_challenge_method', 'S256')
  if (provider === 'google') {
    url.searchParams.set('access_type', 'offline')
    url.searchParams.set('prompt', 'consent')
  }
  return json({ url: url.toString() })
}

export async function finishOAuth(
  provider: Provider,
  request: Request,
  env: Env,
): Promise<Response> {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  if (!code || !state)
    return json('Missing OAuth callback data', { status: 400 })
  const stateRow = (await env.DB.prepare(
    'SELECT * FROM reading_oauth_states WHERE state = ? AND provider = ?',
  )
    .bind(state, provider)
    .first()) as {
    verifier: string
    redirect_uri: string
    expires_at: number
  } | null
  if (!stateRow || stateRow.expires_at < Date.now())
    return json('OAuth state expired', { status: 400 })
  await env.DB.prepare('DELETE FROM reading_oauth_states WHERE state = ?')
    .bind(state)
    .run()

  const config = providerConfig(provider, env)
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    redirect_uri: stateRow.redirect_uri,
    grant_type: 'authorization_code',
    code_verifier: stateRow.verifier,
  })
  const tokenResponse = await fetch(config.token, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })
  const token = (await tokenResponse.json()) as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
    error?: string
  }
  if (!tokenResponse.ok || !token.access_token)
    return json(token.error ?? 'OAuth token exchange failed', { status: 502 })

  let label: string = provider
  if (provider === 'google') {
    const profile = await fetch(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      { headers: { Authorization: `Bearer ${token.access_token}` } },
    ).then((response) => response.json() as Promise<{ email?: string }>)
    label = profile.email ?? provider
  } else {
    const profile = await fetch('https://cloud.feedly.com/v3/profile', {
      headers: { Authorization: `Bearer ${token.access_token}` },
    }).then(
      (response) => response.json() as Promise<{ email?: string; id?: string }>,
    )
    label = profile.email ?? profile.id ?? provider
  }

  const existing = (await env.DB.prepare(
    'SELECT refresh_token_enc FROM reading_connectors WHERE provider = ?',
  )
    .bind(provider)
    .first()) as { refresh_token_enc: string | null } | null
  const refreshEncrypted = token.refresh_token
    ? await encryptConnectorToken(env, token.refresh_token)
    : (existing?.refresh_token_enc ?? null)
  await env.DB.prepare(
    `INSERT INTO reading_connectors
      (id, provider, account_label, access_token_enc, refresh_token_enc, expires_at, status, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'connected', unixepoch())
     ON CONFLICT(provider) DO UPDATE SET
       account_label = excluded.account_label,
       access_token_enc = excluded.access_token_enc,
       refresh_token_enc = excluded.refresh_token_enc,
       expires_at = excluded.expires_at,
       status = 'connected',
       updated_at = unixepoch()`,
  )
    .bind(
      crypto.randomUUID(),
      provider,
      label,
      await encryptConnectorToken(env, token.access_token),
      refreshEncrypted,
      Math.floor(Date.now() / 1000) + (token.expires_in ?? 3600),
    )
    .run()

  return Response.redirect(
    `${publicOrigin(request, env)}/?workspace=reading&connected=${provider}`,
    302,
  )
}

async function accessToken(connector: ConnectorRow, env: Env): Promise<string> {
  if (!connector.access_token_enc)
    throw new Error('Connector is missing a token')
  if ((connector.expires_at ?? 0) > Math.floor(Date.now() / 1000) + 60)
    return decryptConnectorToken(env, connector.access_token_enc)
  if (!connector.refresh_token_enc)
    return decryptConnectorToken(env, connector.access_token_enc)

  const config = providerConfig(connector.provider, env)
  const refreshToken = await decryptConnectorToken(
    env,
    connector.refresh_token_enc,
  )
  const response = await fetch(config.token, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  const body = (await response.json()) as {
    access_token?: string
    expires_in?: number
  }
  if (!body.access_token) throw new Error('Could not refresh connector token')
  await env.DB.prepare(
    'UPDATE reading_connectors SET access_token_enc = ?, expires_at = ?, updated_at = unixepoch() WHERE provider = ?',
  )
    .bind(
      await encryptConnectorToken(env, body.access_token),
      Math.floor(Date.now() / 1000) + (body.expires_in ?? 3600),
      connector.provider,
    )
    .run()
  return body.access_token
}

function stripHtml(value: string): string {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

function decodeGmail(value?: string): string {
  if (!value) return ''
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  return decodeURIComponent(
    Array.from(
      atob(normalized),
      (character) =>
        `%${character.charCodeAt(0).toString(16).padStart(2, '0')}`,
    ).join(''),
  )
}

function gmailBody(payload: any): string {
  if (payload?.body?.data) return decodeGmail(payload.body.data)
  const parts = Array.isArray(payload?.parts) ? payload.parts : []
  const text = parts.find((part: any) => part.mimeType === 'text/plain')
  if (text) return gmailBody(text)
  const html = parts.find((part: any) => part.mimeType === 'text/html')
  if (html) return stripHtml(gmailBody(html))
  for (const part of parts) {
    const nested = gmailBody(part)
    if (nested) return nested
  }
  return ''
}

async function pollGoogle(connector: ConnectorRow, env: Env): Promise<number> {
  const token = await accessToken(connector, env)
  const query = env.GMAIL_QUERY ?? 'label:garden-reading'
  const listUrl = new URL(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages',
  )
  listUrl.searchParams.set('q', query)
  listUrl.searchParams.set('maxResults', '25')
  const list = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${token}` },
  }).then(
    (response) =>
      response.json() as Promise<{ messages?: Array<{ id: string }> }>,
  )
  let count = 0
  for (const messageRef of list.messages ?? []) {
    const message = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageRef.id}?format=full`,
      { headers: { Authorization: `Bearer ${token}` } },
    ).then((response) => response.json() as Promise<any>)
    const headers = new Map(
      (message.payload?.headers ?? []).map((header: any) => [
        String(header.name).toLowerCase(),
        String(header.value),
      ]),
    )
    const subject = headers.get('subject') ?? '(no subject)'
    const from = headers.get('from') ?? 'Gmail'
    const body = gmailBody(message.payload) || message.snippet || ''
    await env.DB.prepare(
      `INSERT INTO reading_items
        (id, provider, source_id, external_id, title, author, excerpt, published_at, metadata_json)
       VALUES (?, 'google', ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(provider, external_id) DO UPDATE SET
         title = excluded.title,
         author = excluded.author,
         excerpt = excluded.excerpt,
         published_at = excluded.published_at,
         metadata_json = excluded.metadata_json`,
    )
      .bind(
        crypto.randomUUID(),
        from,
        message.id,
        subject,
        from,
        stripHtml(body).slice(0, 8000),
        Math.floor(Number(message.internalDate) / 1000),
        JSON.stringify({ threadId: message.threadId }),
      )
      .run()
    count++
  }
  return count
}

async function pollFeedly(connector: ConnectorRow, env: Env): Promise<number> {
  const token = await accessToken(connector, env)
  let streamId = env.FEEDLY_STREAM_ID
  if (!streamId) {
    const profile = await fetch('https://cloud.feedly.com/v3/profile', {
      headers: { Authorization: `Bearer ${token}` },
    }).then((response) => response.json() as Promise<{ id: string }>)
    streamId = `user/${profile.id}/category/global.all`
  }
  const url = new URL('https://cloud.feedly.com/v3/streams/contents')
  url.searchParams.set('streamId', streamId)
  url.searchParams.set('count', '50')
  url.searchParams.set('ranked', 'newest')
  const stream = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((response) => response.json() as Promise<any>)
  let count = 0
  for (const item of stream.items ?? []) {
    const link = item.alternate?.[0]?.href ?? item.canonical?.[0]?.href ?? null
    const tags = [
      ...(item.tags ?? []).map((tag: any) => tag.label).filter(Boolean),
      ...(item.categories ?? []).map((tag: any) => tag.label).filter(Boolean),
    ]
    await env.DB.prepare(
      `INSERT INTO reading_items
        (id, provider, source_id, external_id, title, url, author, excerpt, tags_json, published_at, metadata_json)
       VALUES (?, 'feedly', ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(provider, external_id) DO UPDATE SET
         title = excluded.title,
         url = excluded.url,
         author = excluded.author,
         excerpt = excluded.excerpt,
         tags_json = excluded.tags_json,
         published_at = excluded.published_at,
         metadata_json = excluded.metadata_json`,
    )
      .bind(
        crypto.randomUUID(),
        item.origin?.title ?? item.origin?.streamId ?? 'Feedly',
        item.id,
        item.title ?? '(untitled)',
        link,
        item.author ?? item.origin?.title ?? 'Feedly',
        stripHtml(item.content?.content ?? item.summary?.content ?? '').slice(
          0,
          8000,
        ),
        JSON.stringify(tags),
        Math.floor((item.published ?? item.crawled ?? Date.now()) / 1000),
        JSON.stringify({ engagement: item.engagement ?? null }),
      )
      .run()
    count++
  }
  return count
}

export async function pollConnectors(
  env: Env,
): Promise<Record<string, number>> {
  const rows = await env.DB.prepare(
    "SELECT * FROM reading_connectors WHERE status = 'connected'",
  ).all<ConnectorRow>()
  const result: Record<string, number> = {}
  for (const connector of rows.results ?? []) {
    try {
      result[connector.provider] =
        connector.provider === 'google'
          ? await pollGoogle(connector, env)
          : await pollFeedly(connector, env)
      await env.DB.prepare(
        'UPDATE reading_connectors SET last_sync_at = unixepoch(), status = ? WHERE provider = ?',
      )
        .bind('connected', connector.provider)
        .run()
    } catch (error) {
      result[connector.provider] = 0
      await env.DB.prepare(
        'UPDATE reading_connectors SET status = ? WHERE provider = ?',
      )
        .bind(
          `error: ${(error as Error).message}`.slice(0, 200),
          connector.provider,
        )
        .run()
    }
  }
  return result
}
