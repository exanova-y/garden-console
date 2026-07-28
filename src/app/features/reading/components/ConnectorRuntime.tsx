import type { UseQueryResult } from '@tanstack/react-query'
import type { ConnectorStatus, ReadingItem } from '../page/types'

export function ConnectorRuntime({
  connectors,
  items,
}: {
  connectors: UseQueryResult<ConnectorStatus[], Error>
  items: UseQueryResult<ReadingItem[], Error>
}) {
  const connectorState =
    connectors.fetchStatus === 'fetching'
      ? 'polling'
      : connectors.status === 'pending'
        ? 'not_loaded'
        : connectors.status
  const itemState =
    items.fetchStatus === 'fetching'
      ? 'polling'
      : items.status === 'pending'
        ? 'not_polled'
        : items.status

  return (
    <details className="connector-runtime">
      <summary>connector runtime</summary>
      <pre data-connector-runtime>
        {JSON.stringify(
          {
            kind: 'json',
            abstractions: ['gmail', 'feedly'],
            connector_status: connectors.data ?? null,
            connector_query: {
              state: connectorState,
              fetch_status: connectors.fetchStatus,
              error: connectors.error?.message ?? null,
            },
            item_query: {
              state: itemState,
              fetch_status: items.fetchStatus,
              error: items.error?.message ?? null,
              items: items.data ?? [],
            },
          },
          null,
          2,
        )}
      </pre>
    </details>
  )
}
