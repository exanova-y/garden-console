import { useCallback, useEffect, useRef, useState } from 'react'
import { loadCommunityItems } from './client'
import type { SourceItem } from './types'

export type SourceLoadStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface SourcePanelState {
  items: SourceItem[]
  status: SourceLoadStatus
  error: string | null
  updatedAt: number | null
}

const EMPTY_PANEL: SourcePanelState = {
  items: [],
  status: 'idle',
  error: null,
  updatedAt: null,
}

export function useCommunitySourcePanels(sourceIds: string[]) {
  const [panels, setPanels] = useState<Record<string, SourcePanelState>>({})
  const requested = useRef(new Set<string>())
  const controllers = useRef(new Map<string, AbortController>())
  const requestVersions = useRef(new Map<string, number>())

  const refreshSource = useCallback(async (sourceId: string) => {
    controllers.current.get(sourceId)?.abort()
    const controller = new AbortController()
    controllers.current.set(sourceId, controller)
    const version = (requestVersions.current.get(sourceId) ?? 0) + 1
    requestVersions.current.set(sourceId, version)

    setPanels((current) => ({
      ...current,
      [sourceId]: {
        ...(current[sourceId] ?? EMPTY_PANEL),
        status: 'loading',
        error: null,
      },
    }))

    try {
      const items = await loadCommunityItems(sourceId, {
        signal: controller.signal,
      })
      if (
        controller.signal.aborted ||
        requestVersions.current.get(sourceId) !== version
      )
        return
      setPanels((current) => ({
        ...current,
        [sourceId]: {
          items,
          status: 'ready',
          error: null,
          updatedAt: Date.now(),
        },
      }))
    } catch (error) {
      if (
        controller.signal.aborted ||
        requestVersions.current.get(sourceId) !== version
      )
        return
      setPanels((current) => ({
        ...current,
        [sourceId]: {
          ...(current[sourceId] ?? EMPTY_PANEL),
          status: 'error',
          error: error instanceof Error ? error.message : 'source fetch failed',
        },
      }))
    } finally {
      if (controllers.current.get(sourceId) === controller)
        controllers.current.delete(sourceId)
    }
  }, [])

  const refreshAll = useCallback(
    async (ids = sourceIds) => {
      await Promise.allSettled(ids.map((sourceId) => refreshSource(sourceId)))
    },
    [refreshSource, sourceIds],
  )

  useEffect(() => {
    for (const sourceId of sourceIds) {
      if (requested.current.has(sourceId)) continue
      requested.current.add(sourceId)
      void refreshSource(sourceId)
    }

    const active = new Set(sourceIds)
    for (const [sourceId, controller] of controllers.current) {
      if (active.has(sourceId)) continue
      controller.abort()
      controllers.current.delete(sourceId)
      requested.current.delete(sourceId)
    }
  }, [refreshSource, sourceIds])

  useEffect(
    () => () => {
      for (const controller of controllers.current.values()) controller.abort()
      controllers.current.clear()
    },
    [],
  )

  return {
    panels,
    refreshSource,
    refreshAll,
  }
}
