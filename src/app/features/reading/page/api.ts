import type {
  CommunitySourceDef,
  ConnectorStatus,
  ReadingItem,
  ReadingProvider,
  SourcePollResult,
} from './types'

async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init)
  if (!response.ok) throw new Error(await response.text())

  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new Error(
      `Reading API returned ${contentType || 'an unknown content type'} for ${path}. ` +
        'Restart the integrated dev server with `pnpm dev`.',
    )
  }

  return response.json() as Promise<T>
}

export function loadReadingItems(): Promise<ReadingItem[]> {
  return getJson('/api/reading/items?limit=200')
}

export function loadConnectorStatus(): Promise<ConnectorStatus[]> {
  return getJson('/api/reading/connectors')
}

export function loadCommunitySources(): Promise<CommunitySourceDef[]> {
  return getJson('/api/reading/community-sources')
}

export function loadCommunityItems(
  sourceId: string,
  init?: RequestInit,
): Promise<SourcePollResult> {
  return getJson(
    `/api/reading/community-source?id=${encodeURIComponent(sourceId)}`,
    init,
  )
}

export async function beginConnector(provider: ReadingProvider): Promise<void> {
  const token = localStorage.getItem('auth_token')
  if (!token) throw new Error('Owner session required')
  const result = await getJson<{ url: string }>(
    `/api/reading/connect/${provider}/start`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    },
  )
  window.location.assign(result.url)
}

export async function pollConnectors(): Promise<void> {
  const token = localStorage.getItem('auth_token')
  if (!token) throw new Error('Owner session required')
  await getJson('/api/reading/poll-connectors', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
}
