-- 0002_vault.sql
-- Encrypted backup content. The server stores opaque blobs; the client
-- encrypts before upload and decrypts after download. The server never
-- sees plaintext health data.

CREATE TABLE IF NOT EXISTS content (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  data TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_content_user_id ON content(user_id);