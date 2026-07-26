export type ReadingProvider = 'google' | 'feedly'

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
