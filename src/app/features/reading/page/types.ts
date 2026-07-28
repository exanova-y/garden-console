export type ReadingProvider = 'google' | 'feedly'

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

export interface ReadingItem {
  id: string
  provider: ReadingProvider
  source_id: string | null
  external_id: string
  title: string
  url: string | null
  author: string | null
  excerpt: string | null
  tags_json: string
  published_at: number | null
  received_at: number
  metadata_json: string
}

export interface ConnectorStatus {
  provider: ReadingProvider
  account_label: string | null
  status: string
  last_sync_at: number | null
}
