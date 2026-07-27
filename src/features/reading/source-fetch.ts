import { XMLParser } from 'fast-xml-parser'
import { COMMUNITY_SOURCES } from './catalog'
import type { CommunitySourceDef, SourceItem } from './types'

const FETCH_OPTIONS = {
  cf: { cacheTtl: 300 },
  headers: { 'User-Agent': 'peacesign-reader/1.0 (+https://app.adiabatic.garden)' },
} as const

async function fetchJson(url: string): Promise<any> {
  const response = await fetch(url, FETCH_OPTIONS)
  if (!response.ok) throw new Error(`source fetch failed (${response.status})`)
  return response.json()
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, FETCH_OPTIONS)
  if (!response.ok) throw new Error(`source fetch failed (${response.status})`)
  return response.text()
}

export function parseDate(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 10_000_000_000 ? Math.floor(value / 1000) : Math.floor(value)
  }
  if (typeof value !== 'string' || !value) return null
  const time = Date.parse(value)
  return Number.isFinite(time) ? Math.floor(time / 1000) : null
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return []
  return Array.isArray(value) ? value : [value]
}

export function sortItems(items: SourceItem[]): SourceItem[] {
  return items
    .filter((item) => item.title.trim().length > 0)
    .sort((a, b) => (b.published_at ?? 0) - (a.published_at ?? 0))
}

export function normalizeHackerNews(data: any): SourceItem[] {
  return sortItems(
    asArray<any>(data?.hits).map((hit) => ({
      title: String(hit?.title ?? ''),
      url: hit?.url ?? `https://news.ycombinator.com/item?id=${hit?.objectID}`,
      published_at: hit?.created_at_i ?? parseDate(hit?.created_at),
    })),
  )
}

async function fetchHackerNews(def: CommunitySourceDef): Promise<SourceItem[]> {
  return normalizeHackerNews(await fetchJson(def.url))
}

async function fetchRss(def: CommunitySourceDef): Promise<SourceItem[]> {
  const xml = await fetchText(def.url)
  const doc = new XMLParser().parse(xml)
  const items = asArray<any>(doc?.rss?.channel?.item)
  return sortItems(
    items.map((item) => ({
      title: String(item?.title ?? ''),
      url: item?.link ?? null,
      published_at: parseDate(item?.pubDate ?? item?.published),
    })),
  )
}

async function fetchAtom(def: CommunitySourceDef): Promise<SourceItem[]> {
  const xml = await fetchText(def.url)
  const doc = new XMLParser({ ignoreAttributes: false }).parse(xml)
  const entries = asArray<any>(doc?.feed?.entry)
  return sortItems(
    entries.map((entry) => {
      const link = asArray<any>(entry?.link).find(
        (candidate) =>
          candidate?.['@_rel'] === 'alternate' || candidate?.['@_rel'] === undefined,
      )
      const title =
        typeof entry?.title === 'object' ? entry.title['#text'] : entry?.title
      return {
        title: String(title ?? ''),
        url: link?.['@_href'] ?? null,
        published_at: parseDate(entry?.published ?? entry?.updated),
      }
    }),
  )
}

export async function fetchCommunityItems(
  sourceId: string,
): Promise<SourceItem[]> {
  const def = COMMUNITY_SOURCES.find((source) => source.id === sourceId)
  if (!def) throw new Error(`unknown community source: ${sourceId}`)
  if (def.kind === 'api') return fetchHackerNews(def)
  if (def.kind === 'rss') return fetchRss(def)
  return fetchAtom(def)
}
