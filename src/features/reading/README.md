# Reading

The reader is a source-first workspace separate from the health console.
Community sources are searched and toggled from a command-style floating
catalog. The selected source IDs and their order are stored locally, while the
catalog itself is served by the Worker.

Added sources are rendered as a balanced binary space partition. Source order
determines BSP placement and can be changed from the source list or with
`[` / `]`. Each panel owns its loading, stale-data, error, and refresh state so
refreshing one source does not refetch every panel.

Current community sources:

- Hacker News via the Algolia API
- Product Hunt via its Atom feed

RSS, Atom, and source-specific API fetchers normalize entries into dated title
links. Custom source entry is intentionally left disabled until its validation
and server-side fetch policy are designed.

Keyboard interactions:

- `/` or `Cmd/Ctrl+K`: open the source catalog
- `j` / `k`: next / previous link
- `gg` / `G`: first / last link
- `J` / `K`: previous / next source panel
- `[` / `]`: move the focused source earlier / later
- `Enter` or `f`: open the focused link
- `yy`: copy the focused URL
- `r` / `R`: refresh the focused source / all sources
- `?`: shortcut help

The existing owner-managed Gmail and Feedly connectors remain available, but
they are independent of the community source catalog.

## Reference architecture

See [NewsNow reference dataflow](./NEWSNOW_DATAFLOW.md) for the corrected
build-time, server-cache, browser-query, and source-selection interaction flow
that informs this reader.
