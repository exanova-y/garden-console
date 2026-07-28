# App features

This is the destination for application feature code.

- `<feature>/page` owns page composition, feature state, queries, and contracts.
- `<feature>/components` owns components specific to that feature.
- `shared` is reserved for code used by multiple features such as health,
  reading, and auth. Do not move feature-specific code there preemptively.
- `server/<feature>` owns Worker routes, external-source integrations, and D1
  access for that feature.

This is the only feature root. Keep frontend feature code out of `src/server`
and backend implementations out of individual frontend feature directories.

Names may intentionally mirror across the frontend and server namespaces. For
example, `vault/page/crypto.ts` performs fail-closed browser encryption while
`server/vault` validates and stores only encrypted envelopes. The repeated
domain name marks a runtime boundary, not duplicate ownership.
