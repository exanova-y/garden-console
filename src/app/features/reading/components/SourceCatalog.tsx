import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { circularIndex, filterCommunitySources } from '../page/reader-state'
import type { SourcePanelState } from '../page/source-queries'
import type {
  CommunitySourceDef,
  ConnectorStatus,
  ReadingProvider,
} from '../page/types'

const CONNECTOR_CATALOG = [
  {
    type: 'connector' as const,
    id: 'google',
    name: 'Gmail',
    kind: 'json',
    category: 'mail',
    homepage: 'mail.google.com',
    blurb: 'messages through the Gmail JSON API',
  },
  {
    type: 'connector' as const,
    id: 'feedly',
    name: 'Feedly',
    kind: 'json',
    category: 'reader',
    homepage: 'feedly.com',
    blurb: 'subscriptions through the Feedly JSON API',
  },
] satisfies Array<{
  type: 'connector'
  id: ReadingProvider
  name: string
  kind: 'json'
  category: string
  homepage: string
  blurb: string
}>

type CatalogEntry =
  | { type: 'source'; source: CommunitySourceDef }
  | (typeof CONNECTOR_CATALOG)[number]

function connectorMatches(
  entry: (typeof CONNECTOR_CATALOG)[number],
  search: string,
) {
  const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return true
  const searchable = [
    entry.id,
    entry.name,
    entry.kind,
    entry.category,
    entry.homepage,
    entry.blurb,
    'connector',
  ]
    .join(' ')
    .toLowerCase()
  return terms.every((term) => searchable.includes(term))
}

export function SourceCatalog({
  open,
  catalog,
  sourceIds,
  panels,
  connectors,
  state,
  error,
  onRetry,
  onToggle,
  onConnect,
  onClose,
}: {
  open: boolean
  catalog: CommunitySourceDef[]
  sourceIds: string[]
  panels: Record<string, SourcePanelState>
  connectors: ConnectorStatus[]
  state: 'loading' | 'ready' | 'error'
  error: string | null
  onRetry: () => void
  onToggle: (sourceId: string) => void
  onConnect: (provider: ReadingProvider) => void
  onClose: () => void
}) {
  const [search, setSearch] = useState('')
  const [catalogIndex, setCatalogIndex] = useState(0)
  const searchRef = useRef<HTMLInputElement>(null)
  const selectedRef = useRef<HTMLElement>(null)
  const filteredCatalog = useMemo<CatalogEntry[]>(
    () => [
      ...filterCommunitySources(catalog, search).map(
        (source): CatalogEntry => ({ type: 'source', source }),
      ),
      ...CONNECTOR_CATALOG.filter((entry) => connectorMatches(entry, search)),
    ],
    [catalog, search],
  )
  const selectedEntry = filteredCatalog[catalogIndex] ?? null

  useEffect(() => {
    if (!open) return
    setSearch('')
    setCatalogIndex(0)
    window.setTimeout(() => searchRef.current?.focus(), 0)
  }, [open])

  useEffect(() => {
    setCatalogIndex((current) =>
      filteredCatalog.length === 0
        ? 0
        : Math.min(current, filteredCatalog.length - 1),
    )
  }, [filteredCatalog.length])

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest' })
  }, [catalogIndex])

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
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
    } else if (event.key === 'Enter' && selectedEntry) {
      event.preventDefault()
      if (selectedEntry.type === 'source') onToggle(selectedEntry.source.id)
      else onConnect(selectedEntry.id)
    }
  }

  if (!open) return null

  return (
    <div className="source-modal-overlay" onClick={onClose}>
      <div
        className="source-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Add a reading source"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="source-modal-head">
          <div>
            <p className="section-label">[ add source ]</p>
          </div>
          <button onClick={onClose}>done</button>
        </header>
        <input
          ref={searchRef}
          autoFocus
          value={search}
          onChange={(event) => {
            setSearch(event.target.value)
            setCatalogIndex(0)
          }}
          onKeyDown={handleKeyDown}
          placeholder="search reading list"
          aria-label="Search community sources"
          aria-controls="community-source-results"
          aria-activedescendant={
            selectedEntry
              ? `catalog-source-${
                  selectedEntry.type === 'source'
                    ? selectedEntry.source.id
                    : selectedEntry.id
                }`
              : undefined
          }
        />
        <div
          className="catalog-results"
          id="community-source-results"
          role="listbox"
        >
          {state === 'loading' ? (
            <div className="catalog-empty">
              <strong>loading reading list</strong>
            </div>
          ) : state === 'error' ? (
            <div className="catalog-empty">
              <strong>reading list unavailable</strong>
              <span>{error}</span>
              <button onClick={onRetry}>retry</button>
            </div>
          ) : filteredCatalog.length === 0 ? (
            <div className="catalog-empty">
              <strong>no result</strong>
              <button disabled>+ custom source (not implemented)</button>
            </div>
          ) : (
            filteredCatalog.map((entry, index) => {
              const selected = index === catalogIndex
              if (entry.type === 'connector') {
                const connector = connectors.find(
                  ({ provider }) => provider === entry.id,
                )
                return (
                  <article
                    className={
                      selected ? 'catalog-source active' : 'catalog-source'
                    }
                    id={`catalog-source-${entry.id}`}
                    key={`connector-${entry.id}`}
                    ref={selected ? selectedRef : undefined}
                    role="option"
                    aria-selected={selected}
                    onClick={() => setCatalogIndex(index)}
                    onDoubleClick={() => onConnect(entry.id)}
                    onMouseEnter={() => setCatalogIndex(index)}
                  >
                    <div>
                      <div className="catalog-source-name">
                        <strong>{entry.name}</strong>
                        <span className="source-kind source-kind-json">
                          json
                        </span>
                      </div>
                      <p>{entry.blurb}</p>
                      <small>
                        {entry.category} · {entry.homepage} · connector
                      </small>
                    </div>
                    <button onClick={() => onConnect(entry.id)}>
                      {connector?.status ?? 'connect'}
                    </button>
                  </article>
                )
              }

              const source = entry.source
              const added = sourceIds.includes(source.id)
              return (
                <article
                  className={
                    selected ? 'catalog-source active' : 'catalog-source'
                  }
                  id={`catalog-source-${source.id}`}
                  key={source.id}
                  ref={selected ? selectedRef : undefined}
                  role="option"
                  aria-selected={selected}
                  onClick={() => setCatalogIndex(index)}
                  onDoubleClick={() => onToggle(source.id)}
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
                  <button onClick={() => onToggle(source.id)}>
                    {added ? '− remove' : '+ add'}
                  </button>
                </article>
              )
            })
          )}
        </div>
        {selectedEntry && (
          <aside className="catalog-preview" aria-live="polite">
            {selectedEntry.type === 'source' ? (
              <>
                <strong>{selectedEntry.source.name}</strong>
                <span>{selectedEntry.source.blurb}</span>
                <small>
                  {sourceIds.includes(selectedEntry.source.id)
                    ? `${
                        panels[selectedEntry.source.id]?.items.length ?? 0
                      } loaded links`
                    : 'press Enter to add'}
                </small>
              </>
            ) : (
              <>
                <strong>{selectedEntry.name}</strong>
                <span>{selectedEntry.blurb}</span>
                <small>press Enter to connect an owner account</small>
              </>
            )}
          </aside>
        )}
      </div>
    </div>
  )
}
