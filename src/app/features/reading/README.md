# Reading

The reader is a source-first workspace at `/r`, separate from the health
console at `/`. The pathname is updated when switching workspaces, so reloading
keeps the reader open.
Sources are searched and toggled from a command-style floating reading list.
Zustand persists only the selected source IDs and their order to localStorage.
The Worker remains authoritative for available sources.

Added sources are rendered as a persistent binary space partition. The first
source fills the canvas. Each later source splits the focused panel along that
panel rectangle's longest side at a 50/50 ratio, following bspwm's
`longest_side` insertion behavior. Removing a source promotes its sibling;
reordering swaps leaf contents without rebuilding the tree.

Each item occupies one row containing its title and, when provided by the
source, a timestamp. Raw poll envelopes remain available in a collapsed
`runtime` disclosure above the list.

TanStack Query owns each panel's remote state. Queries are disabled by default:
adding or opening a source never polls it automatically.

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
- The panel and toolbar poll buttons fetch one or all visible sources.
- The Worker may still reuse its bounded Cloudflare upstream cache.
- No reading cron or background polling is configured.

`pnpm dev` applies pending local D1 migrations, then runs the React client and
Worker API together through Cloudflare's Vite plugin. Community feeds therefore
use the same `/api/reading/*` routes on localhost and after deployment.

Panels currently display their normalized poll envelope as raw JSON alongside
title links so the runtime flow is inspectable before visual refinement.

Reader keybinds are disabled by default so Vimium and other browser extensions
retain their keys. The `keys` button in the left sidebar shows the current
bindings; `edit mode` allows enabling, changing, clearing, and saving them to
localStorage. The initial optional preset includes hover/focus-aware `o` to
open a link and `x` to close a source panel. `Ctrl+K` (`Cmd+K` on macOS)
always opens source search independently of the optional keybind layer.

Gmail and Feedly are authenticated JSON connector abstractions. Their polling
is also manual. OAuth credentials and normalized connector items remain in D1;
anonymous users persist only reading-list preferences in localStorage. The
connectors appear in source search, not as permanent sidebar controls.

## Structure

- `page/`: page composition, Zustand state, TanStack queries, and browser API
- `components/`: source canvas, catalog, sidebar, connector runtime, keybinds
- `../server/reading/`: Worker routes, reading list, source getters, connectors

Source definitions and executable getters are separate. Adding a JSON source
requires a source-specific getter; there is no generic JSON parser.

## Reference architecture

See [NewsNow reference dataflow](./NEWSNOW_DATAFLOW.md) for the corrected
build-time, server-cache, browser-query, and source-selection interaction flow
that informs this reader.
