import { useCallback, useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'
import { loadCommunityItems } from './api'
import type { SourceItem, SourcePollResult } from './types'

export type SourceLoadStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface SourcePanelState {
  items: SourceItem[]
  result: SourcePollResult | null
  status: SourceLoadStatus
  error: string | null
  updatedAt: number | null
}

export const sourceQueryKey = (sourceId: string) =>
  ['reading', 'source', sourceId] as const

export function useCommunitySourcePanels(sourceIds: string[]) {
  const queries = useQueries({
    queries: sourceIds.map((sourceId) => ({
      queryKey: sourceQueryKey(sourceId),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        loadCommunityItems(sourceId, { signal }),
      enabled: false,
      staleTime: Infinity,
      retry: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
      refetchOnWindowFocus: false,
    })),
  })

  const panels = useMemo(
    () =>
      Object.fromEntries(
        sourceIds.map((sourceId, index) => {
          const query = queries[index]
          const result = query.data ?? null
          const status: SourceLoadStatus =
            query.fetchStatus === 'fetching'
              ? 'loading'
              : query.isError
                ? 'error'
                : result
                  ? 'ready'
                  : 'idle'
          return [
            sourceId,
            {
              items: result?.items ?? [],
              result,
              status,
              error: query.error
                ? query.error instanceof Error
                  ? query.error.message
                  : 'source poll failed'
                : null,
              updatedAt: query.dataUpdatedAt || null,
            } satisfies SourcePanelState,
          ]
        }),
      ),
    [queries, sourceIds],
  )

  const refreshSource = useCallback(
    async (sourceId: string) => {
      const index = sourceIds.indexOf(sourceId)
      if (index === -1) return
      await queries[index].refetch({ cancelRefetch: true })
    },
    [queries, sourceIds],
  )

  const refreshAll = useCallback(
    async (ids = sourceIds) => {
      await Promise.allSettled(
        ids.map(async (sourceId) => {
          const index = sourceIds.indexOf(sourceId)
          if (index === -1) return
          await queries[index].refetch({ cancelRefetch: true })
        }),
      )
    },
    [queries, sourceIds],
  )

  return {
    panels,
    refreshSource,
    refreshAll,
  }
}
