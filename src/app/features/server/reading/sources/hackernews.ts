import type { CommunitySourceDef, SourceItem } from '../types'
import { fetchJson } from './http'
import { asArray, parseDate, sortItems } from './normalize'

export function normalizeHackerNews(data: unknown): SourceItem[] {
  const response = data as { hits?: Record<string, unknown>[] } | null
  return sortItems(
    asArray<Record<string, unknown>>(response?.hits).map((hit) => ({
      title: String(hit.title ?? ''),
      url:
        typeof hit.url === 'string'
          ? hit.url
          : `https://news.ycombinator.com/item?id=${String(hit.objectID ?? '')}`,
      published_at:
        typeof hit.created_at_i === 'number'
          ? hit.created_at_i
          : parseDate(hit.created_at),
    })),
  )
}

export async function getHackerNews(
  definition: CommunitySourceDef,
): Promise<SourceItem[]> {
  return normalizeHackerNews(await fetchJson(definition.url))
}
