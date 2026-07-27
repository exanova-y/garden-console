import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import {
  beginConnector,
  loadCommunitySources,
  loadConnectorStatus,
  refreshReading,
} from './client'
import { COMMUNITY_SOURCES } from './catalog'
import {
  buildBspLayout,
  circularIndex,
  filterCommunitySources,
  moveSource,
  sanitizeSourceIds,
  type BspNode,
} from './reader-state'
import {
  useCommunitySourcePanels,
  type SourcePanelState,
} from './useCommunitySourcePanels'
import type {
  CommunitySourceDef,
  ConnectorStatus,
  ReadingProvider,
  SourceItem,
} from './types'

const SOURCES_STORAGE_KEY = 'peacesign-reading-community-sources'
const DEFAULT_SOURCE_IDS = ['hackernews']

function savedSourceIds(): string[] {
  const available = COMMUNITY_SOURCES.map((source) => source.id)
  try {
    const value = JSON.parse(
      localStorage.getItem(SOURCES_STORAGE_KEY) ?? 'null',
    )
    return sanitizeSourceIds(value, available, DEFAULT_SOURCE_IDS)
  } catch {
    return DEFAULT_SOURCE_IDS
  }
}

function formatDate(timestamp: number | null): string {
  if (!timestamp) return 'date unknown'
  return new Date(timestamp * 1000).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

function formatUpdatedAt(timestamp: number | null): string {
  if (!timestamp) return 'not loaded'
  return `updated ${new Date(timestamp).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  })}`
}

function sourceKey(item: SourceItem, index: number): string {
  return `${item.url ?? item.title}-${item.published_at ?? index}`
}

function SourceTile({
  source,
  panel,
  active,
  activeItemIndex,
  onActivate,
  onItemActivate,
  onRefresh,
  onRemove,
}: {
  source: CommunitySourceDef
  panel: SourcePanelState
  active: boolean
  activeItemIndex: number
  onActivate: () => void
  onItemActivate: (index: number) => void
  onRefresh: () => void
  onRemove: () => void
}) {
  const loading = panel.status === 'loading'

  return (
    <section
      className={active ? 'source-tile active' : 'source-tile'}
      data-source-panel={source.id}
      onClick={onActivate}
    >
      <header className="source-tile-head">
        <div className="source-tile-title">
          <span className={`source-kind source-kind-${source.kind}`}>
            {source.kind}
          </span>
          <div>
            <strong>{source.name}</strong>
            <small>
              {source.category} · {panel.items.length} links ·{' '}
              {formatUpdatedAt(panel.updatedAt)}
            </small>
          </div>
        </div>
        <div className="source-tile-actions">
          <button onClick={onRefresh} disabled={loading} title="Refresh source">
            {loading ? '…' : '↻'}
          </button>
          <button onClick={onRemove} title={`Remove ${source.name}`}>
            ×
          </button>
        </div>
      </header>

      <div className="source-links">
        {panel.error && (
          <button className="source-status" onClick={onRefresh}>
            {panel.error} · retry
          </button>
        )}
        {loading && panel.items.length === 0 ? (
          <p className="source-status">fetching links…</p>
        ) : panel.items.length === 0 && !panel.error ? (
          <p className="source-status">no links returned</p>
        ) : (
          panel.items.map((item, index) => (
            <a
              className={
                active && activeItemIndex === index
                  ? 'source-link active'
                  : 'source-link'
              }
              data-source-id={source.id}
              data-item-index={index}
              href={item.url ?? source.homepage}
              target="_blank"
              rel="noreferrer"
              key={sourceKey(item, index)}
              onClick={() => onItemActivate(index)}
              onFocus={() => {
                onActivate()
                onItemActivate(index)
              }}
            >
              <span>{item.title}</span>
              <time>{formatDate(item.published_at)}</time>
            </a>
          ))
        )}
      </div>
    </section>
  )
}

function BspTile({
  node,
  definitions,
  panels,
  activeSourceId,
  activeItemBySource,
  onActivate,
  onItemActivate,
  onRefresh,
  onRemove,
}: {
  node: BspNode
  definitions: Map<string, CommunitySourceDef>
  panels: Record<string, SourcePanelState>
  activeSourceId: string | null
  activeItemBySource: Record<string, number>
  onActivate: (sourceId: string) => void
  onItemActivate: (sourceId: string, index: number) => void
  onRefresh: (sourceId: string) => void
  onRemove: (sourceId: string) => void
}) {
  if (node.kind === 'leaf') {
    const source = definitions.get(node.sourceId)
    if (!source) return null
    return (
      <SourceTile
        source={source}
        panel={
          panels[node.sourceId] ?? {
            items: [],
            status: 'idle',
            error: null,
            updatedAt: null,
          }
        }
        active={activeSourceId === node.sourceId}
        activeItemIndex={activeItemBySource[node.sourceId] ?? 0}
        onActivate={() => onActivate(node.sourceId)}
        onItemActivate={(index) => onItemActivate(node.sourceId, index)}
        onRefresh={() => onRefresh(node.sourceId)}
        onRemove={() => onRemove(node.sourceId)}
      />
    )
  }

  const childProps = {
    definitions,
    panels,
    activeSourceId,
    activeItemBySource,
    onActivate,
    onItemActivate,
    onRefresh,
    onRemove,
  }
  return (
    <div className={`bsp-split bsp-${node.direction}`}>
      <BspTile node={node.first} {...childProps} />
      <BspTile node={node.second} {...childProps} />
    </div>
  )
}

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  )
}

export function ReadingConsole() {
  const [sourceIds, setSourceIds] = useState(savedSourceIds)
  const [catalog, setCatalog] =
    useState<CommunitySourceDef[]>(COMMUNITY_SOURCES)
  const [connectors, setConnectors] = useState<ConnectorStatus[]>([])
  const [activeSourceId, setActiveSourceId] = useState<string | null>(
    () => savedSourceIds()[0] ?? null,
  )
  const [activeItemBySource, setActiveItemBySource] = useState<
    Record<string, number>
  >({})
  const [showAdd, setShowAdd] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [search, setSearch] = useState('')
  const [catalogIndex, setCatalogIndex] = useState(0)
  const [message, setMessage] = useState('source tiles / ready')
  const searchRef = useRef<HTMLInputElement>(null)
  const keySequence = useRef({ key: '', at: 0 })
  const { panels, refreshSource, refreshAll } =
    useCommunitySourcePanels(sourceIds)

  const definitions = useMemo(
    () => new Map(catalog.map((source) => [source.id, source])),
    [catalog],
  )
  const tree = useMemo(() => buildBspLayout(sourceIds), [sourceIds])
  const filteredCatalog = useMemo(
    () => filterCommunitySources(catalog, search),
    [catalog, search],
  )
  const selectedCatalogSource = filteredCatalog[catalogIndex] ?? null
  const activePanel = activeSourceId ? panels[activeSourceId] : undefined
  const activeItemIndex = activeSourceId
    ? (activeItemBySource[activeSourceId] ?? 0)
    : 0
  const activeItem = activePanel?.items[activeItemIndex] ?? null
  const activeUrl =
    activeItem?.url ??
    (activeSourceId ? definitions.get(activeSourceId)?.homepage : null)

  useEffect(() => {
    localStorage.setItem(SOURCES_STORAGE_KEY, JSON.stringify(sourceIds))
  }, [sourceIds])

  useEffect(() => {
    if (activeSourceId && sourceIds.includes(activeSourceId)) return
    setActiveSourceId(sourceIds[0] ?? null)
  }, [activeSourceId, sourceIds])

  useEffect(() => {
    setCatalogIndex((current) =>
      filteredCatalog.length === 0
        ? 0
        : Math.min(current, filteredCatalog.length - 1),
    )
  }, [filteredCatalog.length])

  useEffect(() => {
    if (!activeSourceId) return
    const links = document.querySelectorAll<HTMLElement>(
      `[data-source-id="${activeSourceId}"]`,
    )
    links[activeItemIndex]?.scrollIntoView({ block: 'nearest' })
  }, [activeItemIndex, activeSourceId])

  useEffect(() => {
    if (!activeSourceId || !activePanel?.items.length) return
    if (activeItemIndex < activePanel.items.length) return
    setActiveItemBySource((current) => ({
      ...current,
      [activeSourceId]: activePanel.items.length - 1,
    }))
  }, [activeItemIndex, activePanel?.items.length, activeSourceId])

  useEffect(() => {
    let cancelled = false
    loadCommunitySources()
      .then((sources) => {
        if (!cancelled && sources.length) setCatalog(sources)
      })
      .catch(() => undefined)
    loadConnectorStatus()
      .then((status) => {
        if (!cancelled) setConnectors(status)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  function openCatalog() {
    setShowHelp(false)
    setShowAdd(true)
    setCatalogIndex(0)
    window.setTimeout(() => searchRef.current?.focus(), 0)
  }

  function closeCatalog() {
    setShowAdd(false)
    setSearch('')
    setCatalogIndex(0)
  }

  function toggleSource(sourceId: string) {
    const sourceName = definitions.get(sourceId)?.name ?? sourceId
    if (sourceIds.includes(sourceId)) {
      setSourceIds((current) => current.filter((id) => id !== sourceId))
      setMessage(`removed ${sourceName}`)
      return
    }
    setSourceIds((current) => [...current, sourceId])
    setActiveSourceId(sourceId)
    setActiveItemBySource((current) => ({ ...current, [sourceId]: 0 }))
    setMessage(`added ${sourceName}`)
  }

  function removeSource(sourceId: string) {
    const index = sourceIds.indexOf(sourceId)
    const nextIds = sourceIds.filter((id) => id !== sourceId)
    setSourceIds(nextIds)
    if (activeSourceId === sourceId)
      setActiveSourceId(nextIds[Math.min(index, nextIds.length - 1)] ?? null)
    setMessage(`removed ${definitions.get(sourceId)?.name ?? sourceId}`)
  }

  function moveActiveSource(delta: -1 | 1) {
    if (!activeSourceId) return
    const next = moveSource(sourceIds, activeSourceId, delta)
    if (next === sourceIds) return
    setSourceIds(next)
    setMessage(
      `moved ${definitions.get(activeSourceId)?.name ?? activeSourceId}`,
    )
  }

  function activateSource(delta: number) {
    if (sourceIds.length === 0) return
    const current = Math.max(0, sourceIds.indexOf(activeSourceId ?? ''))
    const index = circularIndex(current, delta, sourceIds.length)
    setActiveSourceId(sourceIds[index])
  }

  function activateItem(index: number) {
    if (!activeSourceId || !activePanel?.items.length) return
    const next = Math.max(0, Math.min(index, activePanel.items.length - 1))
    setActiveItemBySource((current) => ({
      ...current,
      [activeSourceId]: next,
    }))
  }

  function refreshOne(sourceId: string) {
    setMessage(`refreshing ${definitions.get(sourceId)?.name ?? sourceId}`)
    void refreshSource(sourceId)
  }

  function refreshVisibleSources() {
    setMessage('refreshing all sources')
    void refreshAll().then(() => setMessage('source refresh complete'))
  }

  function openActiveItem() {
    if (!activeUrl) return
    window.open(activeUrl, '_blank', 'noopener,noreferrer')
  }

  function handleCatalogKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeCatalog()
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      setCatalogIndex((current) =>
        circularIndex(current, 1, filteredCatalog.length),
      )
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setCatalogIndex((current) =>
        circularIndex(current, -1, filteredCatalog.length),
      )
    } else if (event.key === 'Enter' && selectedCatalogSource) {
      event.preventDefault()
      toggleSource(selectedCatalogSource.id)
    }
  }

  async function connect(provider: ReadingProvider) {
    try {
      await beginConnector(provider)
    } catch (error) {
      setMessage((error as Error).message)
    }
  }

  async function syncOwnerStream() {
    try {
      setMessage('refreshing owner stream')
      await refreshReading()
      setMessage('owner stream refreshed')
    } catch (error) {
      setMessage((error as Error).message)
    }
  }

  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (showAdd) closeCatalog()
        if (showHelp) setShowHelp(false)
        return
      }
      if (showAdd || showHelp) return
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        openCatalog()
        return
      }
      if (isTyping(event.target)) return

      const now = Date.now()
      const prior =
        now - keySequence.current.at < 800 ? keySequence.current.key : ''
      const sequence = `${prior}${event.key}`
      keySequence.current = { key: event.key, at: now }

      if (sequence === 'gg') {
        event.preventDefault()
        activateItem(0)
        keySequence.current = { key: '', at: 0 }
      } else if (sequence === 'yy' && activeUrl) {
        event.preventDefault()
        void navigator.clipboard
          .writeText(activeUrl)
          .then(() => setMessage('url copied'))
        keySequence.current = { key: '', at: 0 }
      } else if (event.key === 'g' || event.key === 'y') {
        event.preventDefault()
      } else if (event.key === '/') {
        event.preventDefault()
        openCatalog()
      } else if (event.key === '?') {
        event.preventDefault()
        setShowHelp(true)
      } else if (event.key === 'j') {
        event.preventDefault()
        activateItem(activeItemIndex + 1)
      } else if (event.key === 'k') {
        event.preventDefault()
        activateItem(activeItemIndex - 1)
      } else if (event.key === 'G') {
        event.preventDefault()
        activateItem((activePanel?.items.length ?? 1) - 1)
      } else if (event.key === 'J') {
        event.preventDefault()
        activateSource(-1)
      } else if (event.key === 'K') {
        event.preventDefault()
        activateSource(1)
      } else if (event.key === '[') {
        event.preventDefault()
        moveActiveSource(-1)
      } else if (event.key === ']') {
        event.preventDefault()
        moveActiveSource(1)
      } else if (event.key === 'Enter' || event.key === 'f') {
        event.preventDefault()
        openActiveItem()
      } else if (event.key === 'r' && activeSourceId) {
        event.preventDefault()
        refreshOne(activeSourceId)
      } else if (event.key === 'R') {
        event.preventDefault()
        refreshVisibleSources()
      }
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  })

  return (
    <section className="reading-workbench">
      <aside className="reading-sidebar">
        <header className="reading-sidebar-head">
          <div>
            <p className="section-label">[ reading / sources ]</p>
            <h1>peacesign reader</h1>
          </div>
          <button className="add-source-button" onClick={openCatalog}>
            + source
          </button>
        </header>

        <div className="source-manager-copy">
          <p>community feeds, arranged as a binary space partition.</p>
          <small>
            {sourceIds.length} source{sourceIds.length === 1 ? '' : 's'} active
            · {message}
          </small>
        </div>

        <div className="source-list" aria-label="Added sources">
          {sourceIds.map((sourceId, index) => {
            const source = definitions.get(sourceId)
            if (!source) return null
            const active = activeSourceId === sourceId
            return (
              <div
                className={
                  active ? 'source-list-row active' : 'source-list-row'
                }
                key={sourceId}
                role="button"
                tabIndex={0}
                aria-current={active ? 'true' : undefined}
                onClick={() => setActiveSourceId(sourceId)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    setActiveSourceId(sourceId)
                  }
                }}
              >
                <span className={`source-kind source-kind-${source.kind}`} />
                <span>{source.name}</span>
                <span className="source-list-actions">
                  <button
                    disabled={index === 0}
                    onClick={(event) => {
                      event.stopPropagation()
                      setSourceIds(moveSource(sourceIds, sourceId, -1))
                    }}
                    aria-label={`Move ${source.name} earlier`}
                  >
                    ↑
                  </button>
                  <button
                    disabled={index === sourceIds.length - 1}
                    onClick={(event) => {
                      event.stopPropagation()
                      setSourceIds(moveSource(sourceIds, sourceId, 1))
                    }}
                    aria-label={`Move ${source.name} later`}
                  >
                    ↓
                  </button>
                  <button
                    onClick={(event) => {
                      event.stopPropagation()
                      removeSource(sourceId)
                    }}
                    aria-label={`Remove ${source.name}`}
                  >
                    ×
                  </button>
                </span>
              </div>
            )
          })}
          {sourceIds.length === 0 && (
            <p className="reading-empty">No sources yet. Add one to begin.</p>
          )}
        </div>

        <div className="connector-strip">
          {(['google', 'feedly'] as const).map((provider) => {
            const connector = connectors.find(
              (entry) => entry.provider === provider,
            )
            return (
              <button
                className={connector ? 'connector connected' : 'connector'}
                key={provider}
                onClick={() => connect(provider)}
              >
                {provider === 'google' ? 'gmail' : 'feedly'}
                <small>{connector?.status ?? 'connect'}</small>
              </button>
            )
          })}
          <button className="connector" onClick={syncOwnerStream}>
            owner sync<small>optional</small>
          </button>
        </div>
      </aside>

      <main className="reading-sources">
        <header className="source-toolbar">
          <span>
            {tree ? 'bsp / live source panels' : 'bsp / empty workspace'}
          </span>
          <div className="source-toolbar-actions">
            <button onClick={openCatalog}>add</button>
            <button onClick={refreshVisibleSources}>refresh</button>
            <button onClick={() => setShowHelp(true)}>?</button>
          </div>
        </header>
        <div className="bsp-canvas">
          {tree ? (
            <BspTile
              node={tree}
              definitions={definitions}
              panels={panels}
              activeSourceId={activeSourceId}
              activeItemBySource={activeItemBySource}
              onActivate={setActiveSourceId}
              onItemActivate={(sourceId, index) => {
                setActiveSourceId(sourceId)
                setActiveItemBySource((current) => ({
                  ...current,
                  [sourceId]: index,
                }))
              }}
              onRefresh={refreshOne}
              onRemove={removeSource}
            />
          ) : (
            <div className="bsp-empty">
              <p className="section-label">[ add a source ]</p>
              <p>Open the source catalog and choose a community feed.</p>
              <button onClick={openCatalog}>open catalog</button>
            </div>
          )}
        </div>
      </main>

      {showAdd && (
        <div className="source-modal-overlay" onClick={closeCatalog}>
          <div
            className="source-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Add a reading source"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="source-modal-head">
              <div>
                <p className="section-label">[ catalog ]</p>
                <h2>add source</h2>
              </div>
              <button onClick={closeCatalog}>done</button>
            </header>
            <input
              ref={searchRef}
              autoFocus
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setCatalogIndex(0)
              }}
              onKeyDown={handleCatalogKeyDown}
              placeholder="search community sources"
              aria-label="Search community sources"
              aria-controls="community-source-results"
              aria-activedescendant={
                selectedCatalogSource
                  ? `catalog-source-${selectedCatalogSource.id}`
                  : undefined
              }
            />
            <div
              className="catalog-results"
              id="community-source-results"
              role="listbox"
            >
              {filteredCatalog.length === 0 ? (
                <div className="catalog-empty">
                  <strong>no community match</strong>
                  <span>custom sources are planned, but not wired yet.</span>
                  <button disabled>+ custom source / coming later</button>
                </div>
              ) : (
                filteredCatalog.map((source, index) => {
                  const added = sourceIds.includes(source.id)
                  const selected = index === catalogIndex
                  return (
                    <article
                      className={
                        selected ? 'catalog-source active' : 'catalog-source'
                      }
                      id={`catalog-source-${source.id}`}
                      key={source.id}
                      role="option"
                      aria-selected={selected}
                      onClick={() => setCatalogIndex(index)}
                      onDoubleClick={() => toggleSource(source.id)}
                      onMouseEnter={() => setCatalogIndex(index)}
                    >
                      <div>
                        <div className="catalog-source-name">
                          <strong>{source.name}</strong>
                          <span
                            className={`source-kind source-kind-${source.kind}`}
                          >
                            {source.kind}
                          </span>
                        </div>
                        <p>{source.blurb}</p>
                        <small>
                          {source.category} ·{' '}
                          {source.homepage.replace(/^https?:\/\//, '')}
                        </small>
                      </div>
                      <button onClick={() => toggleSource(source.id)}>
                        {added ? '− remove' : '+ add'}
                      </button>
                    </article>
                  )
                })
              )}
            </div>
            {selectedCatalogSource && (
              <aside className="catalog-preview" aria-live="polite">
                <strong>{selectedCatalogSource.name}</strong>
                <span>{selectedCatalogSource.blurb}</span>
                <small>
                  {sourceIds.includes(selectedCatalogSource.id)
                    ? `${panels[selectedCatalogSource.id]?.items.length ?? 0} loaded links`
                    : 'press Enter to add'}
                </small>
              </aside>
            )}
          </div>
        </div>
      )}

      {showHelp && (
        <div className="shortcut-overlay" onClick={() => setShowHelp(false)}>
          <div
            className="shortcut-help"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-label="Reading shortcuts"
          >
            <div className="shortcut-help-head">
              <span>reading shortcuts</span>
              <button onClick={() => setShowHelp(false)}>×</button>
            </div>
            {[
              ['j / k', 'next / previous link'],
              ['gg / G', 'first / last link'],
              ['J / K', 'previous / next source panel'],
              ['[ / ]', 'move source earlier / later'],
              ['enter / f', 'open focused link'],
              ['yy', 'copy focused URL'],
              ['r / R', 'refresh focused / all sources'],
              ['/ or cmd+k', 'open source catalog'],
              ['?', 'toggle this help'],
            ].map(([keys, action]) => (
              <div className="shortcut-row" key={keys}>
                <kbd>{keys}</kbd>
                <span>{action}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
