-- Shared reading stream. Connectors are owner-managed; normalized items are
-- public to every guest.

CREATE TABLE IF NOT EXISTS reading_connectors (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL UNIQUE CHECK (provider IN ('google', 'feedly')),
  account_label TEXT,
  access_token_enc TEXT,
  refresh_token_enc TEXT,
  expires_at INTEGER,
  cursor TEXT,
  status TEXT NOT NULL DEFAULT 'disconnected',
  last_sync_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS reading_oauth_states (
  state TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  verifier TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS reading_items (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  source_id TEXT,
  external_id TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT,
  author TEXT,
  excerpt TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]',
  published_at INTEGER,
  received_at INTEGER NOT NULL DEFAULT (unixepoch()),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  UNIQUE(provider, external_id)
);

CREATE INDEX IF NOT EXISTS idx_reading_items_received
  ON reading_items(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_reading_items_provider
  ON reading_items(provider, received_at DESC);
