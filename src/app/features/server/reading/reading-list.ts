import type { CommunitySourceDef } from './types'

export type {
  CommunitySourceDef,
  SourceAdapter,
  SourceItem,
  SourceKind,
} from './types'

/**
 * The curated reading list shown in the add-source window. It is compiled into
 * both the browser bundle and Worker, so it is also the server-side allowlist.
 *
 * Source kinds describe the upstream representation: RSS (including Atom),
 * JSON, or HTML. Adapters describe how a particular representation is
 * normalized; JSON and HTML generally need source-specific adapters.
 */

export const READING_LIST: CommunitySourceDef[] = [
  {
    id: 'hackernews',
    name: 'Hacker News',
    kind: 'json',
    adapter: 'hackernews',
    url: 'https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=30',
    homepage: 'https://news.ycombinator.com',
    category: 'tech',
    blurb: 'front page via Algolia JSON',
  },
  {
    id: 'producthunt',
    name: 'Product Hunt',
    kind: 'rss',
    adapter: 'rss-atom',
    url: 'https://www.producthunt.com/feed',
    homepage: 'https://www.producthunt.com',
    category: 'products',
    blurb: 'new products and launches, Atom feed',
  },
  {
    id: 'scottaaronson',
    name: 'Shtetl-Optimized',
    kind: 'rss',
    adapter: 'rss-atom',
    url: 'https://scottaaronson.blog/?feed=atom',
    homepage: 'https://scottaaronson.blog',
    category: 'science',
    blurb: 'Scott Aaronson on quantum computing, complexity, and academia',
  },
  {
    id: 'ncase',
    name: 'Nicky Case',
    kind: 'rss',
    adapter: 'rss-atom',
    url: 'https://blog.ncase.me/feed.xml',
    homepage: 'https://blog.ncase.me',
    category: 'interactive',
    blurb: 'explorable explanations, systems, and learning',
  },
]
