export type SourceKind = 'rss' | 'json' | 'html'

export type SourceAdapter = 'rss-atom' | 'hackernews' | 'html'

export interface CommunitySourceDef {
  id: string
  name: string
  kind: SourceKind
  adapter: SourceAdapter
  url: string
  homepage: string
  category: string
  blurb: string
}

export interface SourceItem {
  title: string
  url: string | null
  published_at: number | null
}

export interface SourcePollResult {
  source_id: string
  kind: SourceKind
  adapter: SourceAdapter
  polled_at: number
  items: SourceItem[]
}
