import type { CommunitySourceDef } from './types'

export type { CommunitySourceDef, SourceItem, SourceKind } from './types'
/**
 * Community source catalog — the shared "known good" list shown in the
 * add-sources floating window. Deliberately NOT the newsnow source list:
 * these are neutral, globally-readable sources covering the three supported
 * subscription kinds (api / rss / atom).
 */

export const COMMUNITY_SOURCES: CommunitySourceDef[] = [
  {
    id: 'hackernews',
    name: 'Hacker News',
    kind: 'api',
    url: 'https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=30',
    homepage: 'https://news.ycombinator.com',
    category: 'tech',
    blurb: 'front page via the Algolia API',
  },
  {
    id: 'producthunt',
    name: 'Product Hunt',
    kind: 'atom',
    url: 'https://www.producthunt.com/feed',
    homepage: 'https://www.producthunt.com',
    category: 'products',
    blurb: 'new products and launches, Atom feed',
  },
]
