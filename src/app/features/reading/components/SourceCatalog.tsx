import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { circularIndex, filterCommunitySources } from '../page/reader-state'
import type { SourcePanelState } from '../page/source-queries'
import type { CommunitySourceDef } from '../page/types'

export function SourceCatalog({
  open,
  catalog,
  sourceIds,
  panels,
  state,
  error,
  onRetry,
  onToggle,
  onClose,
}: {
  open: boolean
  catalog: CommunitySourceDef[]
  sourceIds: string[]
  panels: Record<string, SourcePanelState>
  state: 'loading' | 'ready' | 'error'
  error: string | null
  onRetry: () => void
  onToggle: (sourceId: string) => void
  onClose: () => void
}) {
  const [search, setSearch] = useState('')
  const [catalogIndex, setCatalogIndex] = useState(0)
  const searchRef = useRef<HTMLInputElement>(null)
  const filteredCatalog = useMemo(
    () => filterCommunitySources(catalog, search),
    [catalog, search],
  )
  const selectedSource = filteredCatalog[catalogIndex] ?? null

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
    } else if (event.key === 'Enter' && selectedSource) {
      event.preventDefault()
      onToggle(selectedSource.id)
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
            selectedSource ? `catalog-source-${selectedSource.id}` : undefined
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
        {selectedSource && (
          <aside className="catalog-preview" aria-live="polite">
            <strong>{selectedSource.name}</strong>
            <span>{selectedSource.blurb}</span>
            <small>
              {sourceIds.includes(selectedSource.id)
                ? `${panels[selectedSource.id]?.items.length ?? 0} loaded links`
                : 'press Enter to add'}
            </small>
          </aside>
        )}
      </div>
    </div>
  )
}
