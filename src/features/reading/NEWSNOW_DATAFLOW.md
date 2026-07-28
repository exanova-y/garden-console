# NewsNow reference dataflow

This diagram documents the NewsNow interaction and information flow that
informs Peacesign's reader. It is a reference architecture, not Peacesign's
implementation contract.

```mermaid
flowchart TB
  subgraph build["Build time — static source catalog"]
    direction LR
    definitions["shared/pre-sources.ts<br/>source definitions"]
    generate["genSources()"]
    registry["generated sources.json<br/>flattened source registry"]
    metadata["shared/metadata.ts<br/>columns + source ordering"]
    modules["server/sources/*<br/>one getter per source"]
    getters["server/getters.ts<br/>glob auto-registration"]

    definitions --> generate --> registry
    definitions --> metadata
    modules --> getters
  end

  subgraph upstream["Upstream publishers"]
    direction LR
    html["HTML websites"]
    api["JSON APIs"]
    feeds["RSS / Atom feeds"]
    rsshub["RSSHub routes"]
  end

  subgraph server["Runtime — Nitro / H3 API"]
    direction TB
    endpoint["GET /api/s?id=:source<br/>optional &latest"]
    validate["validate source ID<br/>resolve redirects"]
    policy{"usable cached value?<br/>source interval + global TTL"}
    database[("database/cache.ts<br/>items + updated timestamp")]
    dispatch["registered source getter"]
    normalize["normalize to common<br/>title + URL + date shape"]
    entire["POST /api/s/entire<br/>bulk cached-source read"]
    fallback["stale-cache fallback<br/>when upstream fails"]

    endpoint --> validate --> policy
    policy -- yes --> database
    policy -- no --> dispatch --> normalize --> database
    dispatch -. failure .-> fallback --> database
    database --> endpoint
    database --> entire
  end

  html --> modules
  api --> modules
  feeds -->|"defineRSSSource()"| modules
  rsshub -->|"defineRSSHubSource()"| modules
  registry -. source IDs + labels .-> endpoint
  getters -. getter lookup .-> dispatch

  subgraph browser["Browser — React SPA"]
    direction TB

    subgraph remoteState["Remote data state"]
      direction LR
      preload["useEntireQuery()<br/>bulk cache prewarm"]
      memory["cacheSources Map"]
      viewport["card enters viewport"]
      query["TanStack Query<br/>query key: source ID"]
      card["NewsCard<br/>items + loading/error state"]
      refresh["card/global refresh<br/>mark source for latest fetch"]

      preload --> memory
      viewport --> query
      memory --> query --> card
      refresh --> query
    end

    subgraph interaction["Catalog and layout interaction"]
      direction LR
      open["More or Cmd/Ctrl+K"]
      palette["cmdk catalog<br/>search static registry"]
      toggle["toggle Focus membership"]
      jotai["Jotai metadata atom<br/>focused IDs + order"]
      local[("localStorage")]
      visible["currentSourcesAtom"]
      grid["responsive card grid"]
      dnd["drag/drop reorder<br/>Focus column only"]

      open --> palette --> toggle --> jotai
      jotai <--> local
      jotai --> visible --> grid
      dnd --> jotai
    end

    subgraph sync["Optional signed-in sync"]
      direction LR
      github["GitHub login"]
      download["download preferences"]
      upload["debounced preference upload"]
      userdb[("server user record")]

      github --> download --> userdb
      jotai --> upload --> userdb
    end

    card --> grid
  end

  registry -. bundled catalog .-> palette
  browser -->|"HTTP request"| server
  entire -->|"cached source payloads"| preload
  endpoint -->|"normalized source payload"| query
```

## Reading the diagram

- Source definitions and getter discovery happen at build/startup time. They
  are not a user-editable subscription database.
- `/api/s` checks the cache before invoking a source getter. A request does not
  necessarily scrape or fetch an upstream publisher.
- HTML, JSON API, RSS, Atom, and RSSHub are ingestion strategies used by source
  modules, not three end-user subscription modes.
- TanStack Query runs in the browser. It manages remote data state around API
  calls; the server owns source fetching and persistent cache policy.
- Jotai owns client interaction state such as focused sources and their order.
  That state persists locally and can optionally synchronize after GitHub
  authentication.
- NewsNow is mounted with React `createRoot`, so the server-to-browser boundary
  is asset delivery plus HTTP API traffic rather than React hydration.
- The catalog searches NewsNow's static registry. It does not accept arbitrary
  custom feed URLs.

