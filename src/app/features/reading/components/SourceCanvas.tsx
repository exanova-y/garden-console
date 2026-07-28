import type { CSSProperties } from 'react'
import type { BspNode } from '../page/reader-state'
import type { SourcePanelState } from '../page/source-queries'
import type { CommunitySourceDef, SourceItem } from '../page/types'

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
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

function SourcePanel({
  source,
  panel,
  active,
  activeItemIndex,
  onActivate,
  onItemActivate,
  onPoll,
  onRemove,
}: {
  source: CommunitySourceDef
  panel: SourcePanelState
  active: boolean
  activeItemIndex: number
  onActivate: () => void
  onItemActivate: (index: number) => void
  onPoll: () => void
  onRemove: () => void
}) {
  const loading = panel.status === 'loading'

  return (
    <section
      className={active ? 'source-tile active' : 'source-tile'}
      data-source-panel={source.id}
      onClick={onActivate}
      onMouseEnter={onActivate}
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
          <button onClick={onPoll} disabled={loading} title="Poll source">
            {loading ? '…' : 'poll'}
          </button>
          <button onClick={onRemove} title={`Remove ${source.name}`}>
            ×
          </button>
        </div>
      </header>

      <details className="source-runtime">
        <summary>runtime</summary>
        <pre data-source-runtime={source.id}>
          {JSON.stringify(
            panel.result ?? {
              source_id: source.id,
              kind: source.kind,
              adapter: source.adapter,
              state: panel.status,
              request: `/api/reading/community-source?id=${source.id}`,
            },
            null,
            2,
          )}
        </pre>
      </details>

      <div className="source-links">
        {panel.error && (
          <button className="source-status" onClick={onPoll}>
            {panel.error} · retry
          </button>
        )}
        {loading && panel.items.length === 0 ? (
          <p className="source-status">polling source…</p>
        ) : panel.status === 'idle' ? (
          <p className="source-status">not polled · press poll</p>
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
              onMouseEnter={() => onItemActivate(index)}
              onFocus={() => {
                onActivate()
                onItemActivate(index)
              }}
            >
              <span>{item.title}</span>
              {item.published_at !== null && (
                <time>{formatTimestamp(item.published_at)}</time>
              )}
            </a>
          ))
        )}
      </div>
    </section>
  )
}

export function SourceCanvas({
  node,
  definitions,
  panels,
  activeSourceId,
  activeItemBySource,
  onActivate,
  onItemActivate,
  onPoll,
  onRemove,
}: {
  node: BspNode
  definitions: Map<string, CommunitySourceDef>
  panels: Record<string, SourcePanelState>
  activeSourceId: string | null
  activeItemBySource: Record<string, number>
  onActivate: (sourceId: string) => void
  onItemActivate: (sourceId: string, index: number) => void
  onPoll: (sourceId: string) => void
  onRemove: (sourceId: string) => void
}) {
  if (node.kind === 'leaf') {
    const source = definitions.get(node.sourceId)
    if (!source) return null
    return (
      <SourcePanel
        source={source}
        panel={
          panels[node.sourceId] ?? {
            items: [],
            result: null,
            status: 'idle',
            error: null,
            updatedAt: null,
          }
        }
        active={activeSourceId === node.sourceId}
        activeItemIndex={activeItemBySource[node.sourceId] ?? 0}
        onActivate={() => onActivate(node.sourceId)}
        onItemActivate={(index) => onItemActivate(node.sourceId, index)}
        onPoll={() => onPoll(node.sourceId)}
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
    onPoll,
    onRemove,
  }

  const style =
    node.axis === 'vertical'
      ? {
          gridTemplateColumns: `minmax(0, ${node.ratio}fr) minmax(0, ${
            1 - node.ratio
          }fr)`,
        }
      : {
          gridTemplateRows: `minmax(0, ${node.ratio}fr) minmax(0, ${
            1 - node.ratio
          }fr)`,
        }

  return (
    <div
      className={`bsp-split bsp-${node.axis}`}
      style={style satisfies CSSProperties}
    >
      <SourceCanvas node={node.first} {...childProps} />
      <SourceCanvas node={node.second} {...childProps} />
    </div>
  )
}
