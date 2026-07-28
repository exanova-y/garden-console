import type { UseQueryResult } from '@tanstack/react-query'
import type {
  ConnectorStatus,
  ReadingItem,
  ReadingProvider,
} from '../page/types'

export function ConnectorRuntime({
  connectors,
  items,
  onConnect,
  onSync,
  onPollStored,
}: {
  connectors: UseQueryResult<ConnectorStatus[], Error>
  items: UseQueryResult<ReadingItem[], Error>
  onConnect: (provider: ReadingProvider) => void
  onSync: () => void
  onPollStored: () => void
}) {
  const connectorData = connectors.data ?? []
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
    <>
      <div className="connector-strip">
        {(['google', 'feedly'] as const).map((provider) => {
          const connector = connectorData.find(
            (entry) => entry.provider === provider,
          )
          return (
            <button
              className={connector ? 'connector connected' : 'connector'}
              key={provider}
              onClick={() => onConnect(provider)}
            >
              {provider === 'google' ? 'gmail' : 'feedly'}
              <small>json · {connector?.status ?? 'connect'}</small>
            </button>
          )
        })}
        <button className="connector" onClick={onSync}>
          owner sync<small>manual</small>
        </button>
        <button className="connector" onClick={onPollStored}>
          stored items<small>manual poll</small>
        </button>
      </div>
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
    </>
  )
}
