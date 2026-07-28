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
  connectors: ConnectorStatus[]
  items: UseQueryResult<ReadingItem[], Error>
  onConnect: (provider: ReadingProvider) => void
  onSync: () => void
  onPollStored: () => void
}) {
  return (
    <>
      <div className="connector-strip">
        {(['google', 'feedly'] as const).map((provider) => {
          const connector = connectors.find(
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
            connector_status: connectors,
            item_query: {
              state:
                items.fetchStatus === 'fetching' ? 'polling' : items.status,
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
