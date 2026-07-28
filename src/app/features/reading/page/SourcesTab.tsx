import { useEffect, useMemo, useRef, useState } from 'react'
import {
  beginConnector,
  loadReadingItems,
  loadCommunitySources,
  loadConnectorStatus,
  pollConnectors,
} from './api'
import { useQuery } from '@tanstack/react-query'
import {
  buildBspLayout,
  circularIndex,
  moveSource,
  sanitizeSourceIds,
} from './reader-state'
import { useReadingStore } from './reading-store'
import { useCommunitySourcePanels } from './source-queries'
import { ReadingSidebar } from '../components/ReadingSidebar'
import { ShortcutHelp } from '../components/ShortcutHelp'
import { SourceCatalog } from '../components/SourceCatalog'
import { SourceCanvas } from '../components/SourceCanvas'
import type {
  CommunitySourceDef,
  ConnectorStatus,
  ReadingItem,
  ReadingProvider,
} from './types'

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  )
}

export function SourcesTab() {
  const sourceIds = useReadingStore((state) => state.sourceIds)
  const setSourceIds = useReadingStore((state) => state.setSourceIds)
  const activeSourceId = useReadingStore((state) => state.activeSourceId)
  const setActiveSourceId = useReadingStore((state) => state.setActiveSourceId)
  const activeItemBySource = useReadingStore(
    (state) => state.activeItemBySource,
  )
  const setActiveItem = useReadingStore((state) => state.setActiveItem)
  const toggleStoredSource = useReadingStore((state) => state.toggleSource)
  const removeStoredSource = useReadingStore((state) => state.removeSource)
  const moveStoredSource = useReadingStore((state) => state.moveActiveSource)
  const [catalog, setCatalog] = useState<CommunitySourceDef[]>([])
  const [connectors, setConnectors] = useState<ConnectorStatus[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [message, setMessage] = useState('source tiles / ready')
  const keySequence = useRef({ key: '', at: 0 })
  const { panels, refreshSource, refreshAll } =
    useCommunitySourcePanels(sourceIds)
  const ownerItems = useQuery<ReadingItem[]>({
    queryKey: ['reading', 'connector-items'],
    queryFn: loadReadingItems,
    enabled: false,
    staleTime: Infinity,
    retry: false,
  })

  const definitions = useMemo(
    () => new Map(catalog.map((source) => [source.id, source])),
    [catalog],
  )
  const tree = useMemo(() => buildBspLayout(sourceIds), [sourceIds])
  const activePanel = activeSourceId ? panels[activeSourceId] : undefined
  const activeItemIndex = activeSourceId
    ? (activeItemBySource[activeSourceId] ?? 0)
    : 0
  const activeItem = activePanel?.items[activeItemIndex] ?? null
  const activeUrl =
    activeItem?.url ??
    (activeSourceId ? definitions.get(activeSourceId)?.homepage : null)

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
    setActiveItem(activeSourceId, activePanel.items.length - 1)
  }, [activeItemIndex, activePanel?.items.length, activeSourceId])

  useEffect(() => {
    let cancelled = false
    loadCommunitySources()
      .then((sources) => {
        if (!cancelled && sources.length) {
          setCatalog(sources)
          setSourceIds((current) =>
            sanitizeSourceIds(
              current,
              sources.map((source) => source.id),
              ['hackernews'],
            ),
          )
        }
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
  }

  function closeCatalog() {
    setShowAdd(false)
  }

  function toggleSource(sourceId: string) {
    const sourceName = definitions.get(sourceId)?.name ?? sourceId
    const added = toggleStoredSource(sourceId)
    setMessage(`${added ? 'added' : 'removed'} ${sourceName}`)
  }

  function removeSource(sourceId: string) {
    removeStoredSource(sourceId)
    setMessage(`removed ${definitions.get(sourceId)?.name ?? sourceId}`)
  }

  function moveActiveSource(delta: -1 | 1) {
    if (!activeSourceId) return
    const next = moveSource(sourceIds, activeSourceId, delta)
    if (next === sourceIds) return
    moveStoredSource(delta)
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
    setActiveItem(activeSourceId, next)
  }

  function refreshOne(sourceId: string) {
    setMessage(`polling ${definitions.get(sourceId)?.name ?? sourceId}`)
    void refreshSource(sourceId)
  }

  function refreshVisibleSources() {
    setMessage('polling all sources')
    void refreshAll().then(() => setMessage('source poll complete'))
  }

  function openActiveItem() {
    if (!activeUrl) return
    window.open(activeUrl, '_blank', 'noopener,noreferrer')
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
      setMessage('polling connector sources')
      await pollConnectors()
      await ownerItems.refetch()
      setMessage('connector poll complete')
    } catch (error) {
      setMessage((error as Error).message)
    }
  }

  async function pollStoredOwnerItems() {
    setMessage('polling stored connector items')
    await ownerItems.refetch()
    setMessage('stored connector poll complete')
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
      <ReadingSidebar
        sourceIds={sourceIds}
        definitions={definitions}
        activeSourceId={activeSourceId}
        message={message}
        connectors={connectors}
        connectorItems={ownerItems}
        onOpenCatalog={openCatalog}
        onActivate={setActiveSourceId}
        onMove={(sourceId, delta) =>
          setSourceIds(moveSource(sourceIds, sourceId, delta))
        }
        onRemove={removeSource}
        onConnect={(provider) => void connect(provider)}
        onSyncConnectors={() => void syncOwnerStream()}
        onPollStored={() => void pollStoredOwnerItems()}
      />

      <main className="reading-sources">
        <header className="source-toolbar">
          <span>
            {tree ? 'bsp / manual source polling' : 'bsp / empty workspace'}
          </span>
          <div className="source-toolbar-actions">
            <button onClick={openCatalog}>add</button>
            <button onClick={refreshVisibleSources}>poll all</button>
            <button onClick={() => setShowHelp(true)}>?</button>
          </div>
        </header>
        <div className="bsp-canvas">
          {tree ? (
            <SourceCanvas
              node={tree}
              definitions={definitions}
              panels={panels}
              activeSourceId={activeSourceId}
              activeItemBySource={activeItemBySource}
              onActivate={setActiveSourceId}
              onItemActivate={(sourceId, index) => {
                setActiveSourceId(sourceId)
                setActiveItem(sourceId, index)
              }}
              onPoll={refreshOne}
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

      <SourceCatalog
        open={showAdd}
        catalog={catalog}
        sourceIds={sourceIds}
        panels={panels}
        onToggle={toggleSource}
        onClose={closeCatalog}
      />
      <ShortcutHelp open={showHelp} onClose={() => setShowHelp(false)} />
    </section>
  )
}
