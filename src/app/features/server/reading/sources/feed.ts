import { XMLParser } from 'fast-xml-parser'
import type { CommunitySourceDef, SourceItem } from '../types'
import { fetchText } from './http'
import { asArray, parseDate, sortItems } from './normalize'

export async function getFeed(
  definition: CommunitySourceDef,
): Promise<SourceItem[]> {
  const xml = await fetchText(definition.url)
  const doc = new XMLParser({ ignoreAttributes: false }).parse(xml)
  const rssItems = asArray<Record<string, any>>(doc?.rss?.channel?.item)
  if (rssItems.length) {
    return sortItems(
      rssItems.map((item) => ({
        title:
          typeof item.title === 'object'
            ? String(item.title['#text'] ?? '')
            : String(item.title ?? ''),
        url:
          typeof item.link === 'object'
            ? (item.link['#text'] ?? item.link['@_href'] ?? null)
            : (item.link ?? null),
        published_at: parseDate(item.pubDate ?? item.published ?? item.updated),
      })),
    )
  }

  const entries = asArray<Record<string, any>>(doc?.feed?.entry)
  return sortItems(
    entries.map((entry) => {
      const link = asArray<Record<string, string>>(entry.link).find(
        (candidate) =>
          candidate['@_rel'] === 'alternate' ||
          candidate['@_rel'] === undefined,
      )
      const title =
        typeof entry.title === 'object' ? entry.title['#text'] : entry.title
      return {
        title: String(title ?? ''),
        url: link?.['@_href'] ?? null,
        published_at: parseDate(entry.published ?? entry.updated),
      }
    }),
  )
}
