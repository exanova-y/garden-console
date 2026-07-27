import { useEffect, useMemo, useRef, useState } from 'react'
import {
  beginConnector,
  loadConnectorStatus,
  loadReadingItems,
  refreshReading,
} from './client'
import { INTEREST_TAGS } from './interests'
import type { ConnectorStatus, ReadingItem, ReadingProvider } from './types'

type Split = 'single' | 'columns' | 'rows'

interface Pane {
  id: string
  itemId: string
}

function itemTags(item: ReadingItem): string[] {
  try {
    return JSON.parse(item.tags_json) as string[]
  } catch {
    return []
  }
}

function rank(item: ReadingItem, seed: number): number {
  const text =
    `${item.title} ${item.excerpt ?? ''} ${itemTags(item).join(' ')}`.toLowerCase()
  const interest = INTEREST_TAGS.reduce(
    (score, tag) => score + (text.includes(tag) ? 12 : 0),
    0,
  )
  const ageHours = Math.max(
    0,
    (Date.now() / 1000 - (item.published_at ?? item.received_at)) / 3600,
  )
  const recency = Math.max(0, 24 - Math.log2(ageHours + 1) * 4)
  let hash = seed
  for (const character of item.id)
    hash = (hash * 31 + character.charCodeAt(0)) | 0
  const jitter = ((hash >>> 0) % 1000) / 250
  return interest + recency + jitter
}

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  )
}

export function ReadingConsole() {
  const [items, setItems] = useState<ReadingItem[]>([])
  const [connectors, setConnectors] = useState<ConnectorStatus[]>([])
  const [focus, setFocus] = useState(0)
  const [panes, setPanes] = useState<Pane[]>([])
  const [activePane, setActivePane] = useState<string | null>(null)
  const [split, setSplit] = useState<Split>('single')
  const [rankSeed, setRankSeed] = useState(0)
  const [message, setMessage] = useState('stream mode')
  const [search, setSearch] = useState('')
  const [showHelp, setShowHelp] = useState(false)
  const sequence = useRef({ key: '', at: 0 })
  const closedPanes = useRef<Pane[]>([])
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    Promise.all([loadReadingItems(), loadConnectorStatus()])
      .then(([nextItems, nextConnectors]) => {
        setItems(nextItems)
        setConnectors(nextConnectors)
      })
      .catch((error) => setMessage((error as Error).message))
  }, [])

  const ranked = useMemo(() => {
    const query = search.trim().toLowerCase()
    return [...items]
      .filter(
        (item) =>
          !query ||
          `${item.title} ${item.excerpt ?? ''} ${item.source_id ?? ''}`
            .toLowerCase()
            .includes(query),
      )
      .sort((a, b) => rank(b, rankSeed) - rank(a, rankSeed))
  }, [items, rankSeed, search])

  const activeItem = ranked[focus] ?? null

  useEffect(() => {
    document
      .querySelector('.stream-item.active')
      ?.scrollIntoView({ block: 'nearest' })
  }, [focus])

  function openItem(
    item: ReadingItem,
    direction: 'current' | 'left' | 'right' | 'up' | 'down' = 'current',
  ) {
    if (direction === 'current' && panes.length > 0 && activePane) {
      setPanes((current) =>
        current.map((pane) =>
          pane.id === activePane ? { ...pane, itemId: item.id } : pane,
        ),
      )
      return
    }
    const pane = { id: crypto.randomUUID(), itemId: item.id }
    setPanes((current) => {
      if (direction === 'left' || direction === 'up') return [pane, ...current]
      return [...current, pane]
    })
    setActivePane(pane.id)
    if (direction === 'left' || direction === 'right') setSplit('columns')
    if (direction === 'up' || direction === 'down') setSplit('rows')
  }

  function closePane(id = activePane) {
    if (!id) return
    setPanes((current) => {
      const removed = current.find((pane) => pane.id === id)
      if (removed) closedPanes.current.push(removed)
      const next = current.filter((pane) => pane.id !== id)
      setActivePane(next.at(-1)?.id ?? null)
      if (next.length <= 1) setSplit('single')
      return next
    })
  }

  function restorePane() {
    const pane = closedPanes.current.pop()
    if (!pane) return
    setPanes((current) => [...current, pane])
    setActivePane(pane.id)
  }

  function movePane(delta: number) {
    if (!panes.length) return
    const current = Math.max(
      0,
      panes.findIndex((pane) => pane.id === activePane),
    )
    setActivePane(panes[(current + delta + panes.length) % panes.length].id)
  }

  function sequenceKey(key: string): boolean {
    const now = Date.now()
    const previous = now - sequence.current.at < 800 ? sequence.current.key : ''
    const combined = `${previous}${key}`
    sequence.current = { key, at: now }
    if (combined === 'yy' && activeItem?.url) {
      navigator.clipboard
        .writeText(activeItem.url)
        .then(() => setMessage('url copied'))
      sequence.current = { key: '', at: 0 }
      return true
    }
    if (combined === 'gg') {
      setFocus(0)
      sequence.current = { key: '', at: 0 }
      return true
    }
    if (combined === 'gr') {
      setRankSeed((current) => current + 1)
      setFocus(0)
      setMessage('reranked by interests / recency / diversity')
      sequence.current = { key: '', at: 0 }
      return true
    }
    if (combined === 'gi') {
      searchRef.current?.focus()
      sequence.current = { key: '', at: 0 }
      return true
    }
    if (combined === 'g0' && panes[0]) {
      setActivePane(panes[0].id)
      sequence.current = { key: '', at: 0 }
      return true
    }
    if (combined === 'g$' && panes.at(-1)) {
      setActivePane(panes.at(-1)!.id)
      sequence.current = { key: '', at: 0 }
      return true
    }
    return key === 'g' || key === 'y'
  }

  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if (isTyping(event.target)) return
      if (sequenceKey(event.key)) {
        event.preventDefault()
      } else if (event.key === '?') {
        event.preventDefault()
        setShowHelp((current) => !current)
      } else if (event.key === 'j') {
        event.preventDefault()
        setFocus((current) => Math.min(ranked.length - 1, current + 1))
      } else if (event.key === 'k') {
        event.preventDefault()
        setFocus((current) => Math.max(0, current - 1))
      } else if (event.key === 'G') {
        event.preventDefault()
        setFocus(Math.max(0, ranked.length - 1))
      } else if (event.key === 'd') {
        event.preventDefault()
        setFocus((current) => Math.min(ranked.length - 1, current + 8))
      } else if (event.key === 'u') {
        event.preventDefault()
        setFocus((current) => Math.max(0, current - 8))
      } else if ((event.key === 'Enter' || event.key === 'f') && activeItem) {
        openItem(activeItem)
      } else if ((event.key === 'F' || event.key === 'o') && activeItem?.url) {
        window.open(activeItem.url, '_blank', 'noopener,noreferrer')
      } else if (event.key === 'H') {
        history.back()
      } else if (event.key === 'L') {
        history.forward()
      } else if (event.key === 'J') {
        movePane(-1)
      } else if (event.key === 'K') {
        movePane(1)
      } else if (event.key === 'x') {
        closePane()
      } else if (event.key === 'X') {
        restorePane()
      } else if (event.key === '/') {
        event.preventDefault()
        searchRef.current?.focus()
      } else if (event.key === 'r') {
        window.location.reload()
      } else if (event.key === 't') {
        window.open('about:blank', '_blank', 'noopener,noreferrer')
      }
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [activeItem, activePane, panes, ranked.length])

  async function connect(provider: ReadingProvider) {
    try {
      await beginConnector(provider)
    } catch (error) {
      setMessage((error as Error).message)
    }
  }

  async function refresh() {
    try {
      setMessage('refreshing')
      await refreshReading()
      setItems(await loadReadingItems())
      setMessage('refreshed')
    } catch (error) {
      setMessage((error as Error).message)
    }
  }

  return (
    <section className="reading-workbench">
      <aside className="reading-sidebar">
        <header className="reading-sidebar-head">
          <div>
            <p className="section-label">[ stream ]</p>
            <h1>information (work in progress, doesn't work)</h1>
          </div>
          <button
            className="icon-button"
            onClick={() => setRankSeed((seed) => seed + 1)}
            title="rank and shuffle (gr)"
          >
            gr
          </button>
        </header>
        <div className="reading-search">
          <input
            ref={searchRef}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setFocus(0)
            }}
            placeholder="/ search"
            aria-label="Search articles"
          />
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
          <button className="connector" onClick={refresh}>
            refresh<small>owner</small>
          </button>
        </div>
        <div
          className="article-stream"
          role="listbox"
          aria-label="All articles"
        >
          {ranked.length === 0 ? (
            <p className="reading-empty">
              No articles yet. Connect Gmail or Feedly as owner.
            </p>
          ) : (
            ranked.map((item, index) => (
              <button
                key={item.id}
                className={
                  focus === index ? 'stream-item active' : 'stream-item'
                }
                onClick={() => {
                  setFocus(index)
                  openItem(item)
                }}
                role="option"
                aria-selected={focus === index}
              >
                <span className={`provider-mark provider-${item.provider}`} />
                <span className="stream-item-copy">
                  <strong>{item.title}</strong>
                  <small>
                    {item.source_id ?? item.author ?? item.provider}
                  </small>
                </span>
              </button>
            ))
          )}
        </div>
      </aside>

      <main className="reading-editors">
        <header className="editor-toolbar">
          <span>{message}</span>
          <div className="editor-actions">
            <button onClick={() => activeItem && openItem(activeItem, 'left')}>
              split left
            </button>
            <button onClick={() => activeItem && openItem(activeItem, 'right')}>
              split right
            </button>
            <button onClick={() => activeItem && openItem(activeItem, 'up')}>
              split up
            </button>
            <button onClick={() => activeItem && openItem(activeItem, 'down')}>
              split down
            </button>
            <button onClick={() => closePane()}>close</button>
          </div>
        </header>
        <div className={`editor-panes panes-${split}`}>
          {panes.length === 0 ? (
            <div className="editor-welcome">
              <p className="section-label">[ shortcuts ]</p>
              <p>
                j/k move / gr rerank / enter open / yy copy / x close / ? help
              </p>
            </div>
          ) : (
            panes.map((pane) => {
              const item = items.find((entry) => entry.id === pane.itemId)
              if (!item) return null
              return (
                <article
                  className={
                    activePane === pane.id
                      ? 'editor-pane active'
                      : 'editor-pane'
                  }
                  key={pane.id}
                  onClick={() => setActivePane(pane.id)}
                >
                  <header className="editor-tab">
                    <span>{item.title}</span>
                    <button
                      onClick={(event) => {
                        event.stopPropagation()
                        closePane(pane.id)
                      }}
                    >
                      x
                    </button>
                  </header>
                  <div className="editor-content">
                    <p className="editor-source">
                      {item.source_id ?? item.author ?? item.provider}
                    </p>
                    <h2>{item.title}</h2>
                    <p>{item.excerpt || 'No preview available.'}</p>
                    <div className="editor-tags">
                      {itemTags(item).map((tag) => (
                        <span key={tag}>#{tag.replace(/^#/, '')}</span>
                      ))}
                    </div>
                    {item.url && (
                      <a href={item.url} target="_blank" rel="noreferrer">
                        open source
                      </a>
                    )}
                  </div>
                </article>
              )
            })
          )}
        </div>
      </main>

      {showHelp && (
        <div className="shortcut-overlay" onClick={() => setShowHelp(false)}>
          <div
            className="shortcut-help"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-label="Vimium shortcuts"
          >
            <div className="shortcut-help-head">
              <span>Vimium shortcuts</span>
              <button onClick={() => setShowHelp(false)}>x</button>
            </div>
            {[
              ['j / k', 'next / previous article'],
              ['gg / G', 'first / last article'],
              ['d / u', 'half-page down / up'],
              ['f / F', 'open pane / open source'],
              ['yy', 'copy focused URL'],
              ['x / X', 'close / restore pane'],
              ['J / K', 'previous / next pane'],
              ['/', 'search'],
              ['gi', 'focus search'],
              ['gr', 'rerank and shuffle'],
              ['r', 'reload'],
              ['?', 'toggle help'],
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
