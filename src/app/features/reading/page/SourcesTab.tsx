import { useEffect, useMemo, useRef, useState } from 'react'
import {
  beginConnector,
  loadReadingItems,
  loadCommunitySources,
  loadConnectorStatus,
} from './api'
import { useQuery } from '@tanstack/react-query'
import { circularIndex, DEFAULT_BSP_RECT, type BspRect } from './reader-state'
import {
  eventKey,
  findReadingKeybindAction,
  loadReadingKeybindSettings,
  saveReadingKeybindSettings,
  type ReadingKeybindSettings,
} from './keybindings'
import { useReadingStore } from './reading-store'
import { useCommunitySourcePanels } from './source-queries'
import { ReadingSidebar } from '../components/ReadingSidebar'
import { SourceCatalog } from '../components/SourceCatalog'
import { SourceCanvas } from '../components/SourceCanvas'
import type { CommunitySourceDef, ReadingItem, ReadingProvider } from './types'

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  )
}

export function SourcesTab() {
  const tree = useReadingStore((state) => state.tree)
  const sourceIds = useReadingStore((state) => state.sourceIds)
  const setAvailableSources = useReadingStore(
    (state) => state.setAvailableSources,
  )
  const activeSourceId = useReadingStore((state) => state.activeSourceId)
  const setActiveSourceId = useReadingStore((state) => state.setActiveSourceId)
  const activeItemBySource = useReadingStore(
    (state) => state.activeItemBySource,
  )
  const setActiveItem = useReadingStore((state) => state.setActiveItem)
  const toggleStoredSource = useReadingStore((state) => state.toggleSource)
  const removeStoredSource = useReadingStore((state) => state.removeSource)
  const moveStoredSource = useReadingStore((state) => state.moveSource)
  const moveActiveStoredSource = useReadingStore(
    (state) => state.moveActiveSource,
  )
  const [showAdd, setShowAdd] = useState(false)
  const [showKeybinds, setShowKeybinds] = useState(false)
  const [keybinds, setKeybinds] = useState(loadReadingKeybindSettings)
  const [canvasRect, setCanvasRect] = useState<BspRect>(DEFAULT_BSP_RECT)
  const canvasRef = useRef<HTMLDivElement>(null)
  const keySequence = useRef({ key: '', at: 0 })
  const { panels, refreshSource, refreshAll } =
    useCommunitySourcePanels(sourceIds)
  const catalogQuery = useQuery<CommunitySourceDef[]>({
    queryKey: ['reading', 'community-sources'],
    queryFn: loadCommunitySources,
    staleTime: Infinity,
    retry: false,
  })
  const connectorQuery = useQuery({
    queryKey: ['reading', 'connectors'],
    queryFn: loadConnectorStatus,
    staleTime: Infinity,
    retry: false,
  })
  const ownerItems = useQuery<ReadingItem[]>({
    queryKey: ['reading', 'connector-items'],
    queryFn: loadReadingItems,
    enabled: false,
    staleTime: Infinity,
    retry: false,
  })
  const catalog = catalogQuery.data ?? []

  const definitions = useMemo(
    () => new Map(catalog.map((source) => [source.id, source])),
    [catalog],
  )
  const activePanel = activeSourceId ? panels[activeSourceId] : undefined
  const activeItemIndex = activeSourceId
    ? (activeItemBySource[activeSourceId] ?? 0)
    : 0
  const activeItem = activePanel?.items[activeItemIndex] ?? null
  const activeUrl =
    activeItem?.url ??
    (activeSourceId ? definitions.get(activeSourceId)?.homepage : null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const measure = () => {
      const bounds = canvas.getBoundingClientRect()
      if (!(bounds.width > 0) || !(bounds.height > 0)) return
      setCanvasRect((current) =>
        current.width === bounds.width && current.height === bounds.height
          ? current
          : { x: 0, y: 0, width: bounds.width, height: bounds.height },
      )
    }

    measure()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }

    const observer = new ResizeObserver(measure)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [])

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
    if (!catalogQuery.data?.length) return
    setAvailableSources(catalogQuery.data.map((source) => source.id))
  }, [catalogQuery.data, setAvailableSources])

  function openCatalog() {
    setShowKeybinds(false)
    setShowAdd(true)
  }

  function closeCatalog() {
    setShowAdd(false)
  }

  function toggleSource(sourceId: string) {
    toggleStoredSource(sourceId, canvasRect)
  }

  function removeSource(sourceId: string) {
    removeStoredSource(sourceId)
  }

  function moveActiveSource(delta: -1 | 1) {
    if (!activeSourceId) return
    const index = sourceIds.indexOf(activeSourceId)
    if (index + delta < 0 || index + delta >= sourceIds.length) return
    moveActiveStoredSource(delta)
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
    void refreshSource(sourceId)
  }

  function refreshVisibleSources() {
    void refreshAll()
  }

  function openActiveItem() {
    if (!activeUrl) return
    window.open(activeUrl, '_blank', 'noopener,noreferrer')
  }

  async function connect(provider: ReadingProvider) {
    try {
      await beginConnector(provider)
    } catch (error) {
      console.error('Reading connector failed', error)
    }
  }

  function saveKeybinds(settings: ReadingKeybindSettings) {
    saveReadingKeybindSettings(settings)
    setKeybinds(settings)
  }

  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (showAdd) closeCatalog()
        if (showKeybinds) setShowKeybinds(false)
        return
      }
      if (
        !showAdd &&
        !showKeybinds &&
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === 'k'
      ) {
        event.preventDefault()
        openCatalog()
        return
      }
      if (showAdd || showKeybinds || !keybinds.enabled) return
      if (isTyping(event.target)) return

      const now = Date.now()
      const key = eventKey(event)
      const prior =
        key.length === 1 && now - keySequence.current.at < 800
          ? keySequence.current.key
          : ''
      const sequence = `${prior}${key}`
      const action = findReadingKeybindAction(keybinds, key, sequence)

      if (!action) {
        const startsSequence = Object.values(keybinds.bindings).some(
          (binding) =>
            key.length === 1 &&
            binding.length > key.length &&
            binding.startsWith(key),
        )
        keySequence.current = startsSequence
          ? { key, at: now }
          : { key: '', at: 0 }
        if (startsSequence) event.preventDefault()
        return
      }

      event.preventDefault()
      keySequence.current = { key: '', at: 0 }

      switch (action) {
        case 'openHovered':
          openActiveItem()
          break
        case 'closeHovered':
          if (activeSourceId) removeSource(activeSourceId)
          break
        case 'nextItem':
          activateItem(activeItemIndex + 1)
          break
        case 'previousItem':
          activateItem(activeItemIndex - 1)
          break
        case 'firstItem':
          activateItem(0)
          break
        case 'lastItem':
          activateItem((activePanel?.items.length ?? 1) - 1)
          break
        case 'previousSource':
          activateSource(-1)
          break
        case 'nextSource':
          activateSource(1)
          break
        case 'moveSourceEarlier':
          moveActiveSource(-1)
          break
        case 'moveSourceLater':
          moveActiveSource(1)
          break
        case 'copyUrl':
          if (activeUrl) void navigator.clipboard.writeText(activeUrl)
          break
        case 'pollSource':
          if (activeSourceId) refreshOne(activeSourceId)
          break
        case 'pollAll':
          refreshVisibleSources()
          break
        case 'openCatalog':
          openCatalog()
          break
        case 'showKeybinds':
          setShowKeybinds(true)
          break
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
        connectors={connectorQuery}
        connectorItems={ownerItems}
        keybindsOpen={showKeybinds}
        keybinds={keybinds}
        onOpenCatalog={openCatalog}
        onToggleKeybinds={() => setShowKeybinds((open) => !open)}
        onSaveKeybinds={saveKeybinds}
        onActivate={setActiveSourceId}
        onMove={moveStoredSource}
        onRemove={removeSource}
      />

      <main className="reading-sources">
        <header className="source-toolbar">
          <span>{tree ? 'bsp: polling mode' : 'bsp / empty workspace'}</span>
          <div className="source-toolbar-actions">
            {/* <button onClick={openCatalog}>add</button> */}
            <button onClick={refreshVisibleSources}>poll all</button>
          </div>
        </header>
        <div className="bsp-canvas" ref={canvasRef}>
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
        connectors={connectorQuery.data ?? []}
        state={
          catalogQuery.fetchStatus === 'fetching' ||
          catalogQuery.status === 'pending'
            ? 'loading'
            : catalogQuery.isError
              ? 'error'
              : 'ready'
        }
        error={catalogQuery.error?.message ?? null}
        onRetry={() => void catalogQuery.refetch()}
        onToggle={toggleSource}
        onConnect={(provider) => void connect(provider)}
        onClose={closeCatalog}
      />
    </section>
  )
}
