import type { UseQueryResult } from '@tanstack/react-query'
import { ConnectorRuntime } from './ConnectorRuntime'
import { KeybindSettings } from './KeybindSettings'
import type { ReadingKeybindSettings } from '../page/keybindings'
import type {
  CommunitySourceDef,
  ConnectorStatus,
  ReadingItem,
} from '../page/types'

export function ReadingSidebar({
  sourceIds,
  definitions,
  activeSourceId,
  connectors,
  connectorItems,
  keybindsOpen,
  keybinds,
  onOpenCatalog,
  onToggleKeybinds,
  onSaveKeybinds,
  onActivate,
  onMove,
  onRemove,
}: {
  sourceIds: string[]
  definitions: Map<string, CommunitySourceDef>
  activeSourceId: string | null
  connectors: UseQueryResult<ConnectorStatus[], Error>
  connectorItems: UseQueryResult<ReadingItem[], Error>
  keybindsOpen: boolean
  keybinds: ReadingKeybindSettings
  onOpenCatalog: () => void
  onToggleKeybinds: () => void
  onSaveKeybinds: (settings: ReadingKeybindSettings) => void
  onActivate: (sourceId: string) => void
  onMove: (sourceId: string, delta: -1 | 1) => void
  onRemove: (sourceId: string) => void
}) {
  return (
    <aside className="reading-sidebar">
      <header className="reading-sidebar-head">
        <div>
          <h1>infovore portal (work in progress)</h1>
        </div>
        <div className="reading-sidebar-actions">
          <button onClick={onToggleKeybinds}>keys</button>
          <button className="add-source-button" onClick={onOpenCatalog}>
            + source
          </button>
        </div>
      </header>

      <div className="source-manager-copy">
        <p>
          supports html, json and rss feeds arranged as bsp with hotkeys to
          maximize information ingestion. press ctrl + k to add sources.
          references: github.com/ourongxing/newsnow
        </p>
      </div>

      <div className="source-list" aria-label="Added sources">
        {sourceIds.map((sourceId, index) => {
          const source = definitions.get(sourceId)
          if (!source) return null
          const active = activeSourceId === sourceId
          return (
            <div
              className={active ? 'source-list-row active' : 'source-list-row'}
              key={sourceId}
              role="button"
              tabIndex={0}
              aria-current={active ? 'true' : undefined}
              onClick={() => onActivate(sourceId)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onActivate(sourceId)
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
                    onMove(sourceId, -1)
                  }}
                  aria-label={`Move ${source.name} earlier`}
                >
                  ↑
                </button>
                <button
                  disabled={index === sourceIds.length - 1}
                  onClick={(event) => {
                    event.stopPropagation()
                    onMove(sourceId, 1)
                  }}
                  aria-label={`Move ${source.name} later`}
                >
                  ↓
                </button>
                <button
                  onClick={(event) => {
                    event.stopPropagation()
                    onRemove(sourceId)
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

      <KeybindSettings
        open={keybindsOpen}
        settings={keybinds}
        onClose={onToggleKeybinds}
        onSave={onSaveKeybinds}
      />

      <ConnectorRuntime connectors={connectors} items={connectorItems} />
    </aside>
  )
}
