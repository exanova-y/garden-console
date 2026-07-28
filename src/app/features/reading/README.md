# Reading

The reader is a source-first workspace separate from the health console.
Sources are searched and toggled from a command-style floating reading list.
Zustand persists only the selected source IDs and their order to localStorage.
The Worker remains authoritative for available sources.

Added sources are rendered as a balanced binary space partition. Source order
determines BSP placement and can be changed from the source list or with
`[` / `]`. TanStack Query owns each panel's remote state. Queries are disabled
by default: adding or opening a source never polls it automatically.

Current community sources:

- Hacker News via Algolia JSON
- Product Hunt via its Atom feed
- Shtetl-Optimized via Scott Aaronson's Atom feed
- Nicky Case via the blog's XML feed

The three ingestion kinds are RSS, JSON, and HTML. Atom is normalized by the
RSS/feed getter. JSON and HTML use source-specific getters rather than assuming
a common upstream schema. Custom source entry is intentionally disabled until
its validation and server-side fetch policy are designed.

Polling is manual during prototyping:

- A panel starts in an idle state.
- `r` polls the focused source.
- `R` polls all visible sources.
- The Worker may still reuse its bounded Cloudflare upstream cache.
- No reading cron or background polling is configured.

Panels currently display their normalized poll envelope as raw JSON alongside
title links so the runtime flow is inspectable before visual refinement.

Keyboard interactions:

- `/` or `Cmd/Ctrl+K`: open the source catalog
- `j` / `k`: next / previous link
- `gg` / `G`: first / last link
- `J` / `K`: previous / next source panel
- `[` / `]`: move the focused source earlier / later
- `Enter` or `f`: open the focused link
- `yy`: copy the focused URL
- `r` / `R`: poll the focused source / all sources
- `?`: shortcut help

Gmail and Feedly are authenticated JSON connector abstractions. Their polling
is also manual. OAuth credentials and normalized connector items remain in D1;
anonymous users persist only reading-list preferences in localStorage.

## Structure

- `page/`: page composition, Zustand state, TanStack queries, and browser API
- `components/`: source canvas, catalog, sidebar, connector runtime, shortcuts
- `../server/reading/`: Worker routes, reading list, source getters, connectors

Source definitions and executable getters are separate. Adding a JSON source
requires a source-specific getter; there is no generic JSON parser.

## Reference architecture

See [NewsNow reference dataflow](./NEWSNOW_DATAFLOW.md) for the corrected
build-time, server-cache, browser-query, and source-selection interaction flow
that informs this reader.
