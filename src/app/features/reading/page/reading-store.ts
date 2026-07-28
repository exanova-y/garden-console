import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import {
  bspLeafIds,
  buildBspTree,
  insertBspLeaf,
  removeBspLeaf,
  sanitizeBspTree,
  sanitizeStoredSourceIds,
  swapBspLeaves,
  type BspNode,
  type BspRect,
} from './reader-state'

const DEFAULT_SOURCE_IDS = ['hackernews']
const LEGACY_STORAGE_KEY = 'peacesign-reading-community-sources'
export const READING_PREFERENCES_KEY = 'peacesign-reading-preferences'

function legacySourceIds(): string[] {
  if (typeof localStorage === 'undefined') return DEFAULT_SOURCE_IDS
  try {
    return sanitizeStoredSourceIds(
      JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) ?? 'null'),
      DEFAULT_SOURCE_IDS,
    )
  } catch {
    return DEFAULT_SOURCE_IDS
  }
}

interface ReadingState {
  tree: BspNode | null
  sourceIds: string[]
  activeSourceId: string | null
  activeItemBySource: Record<string, number>
  setAvailableSources: (sourceIds: Iterable<string>) => void
  toggleSource: (sourceId: string, rootRect: BspRect) => boolean
  removeSource: (sourceId: string) => void
  moveSource: (sourceId: string, delta: -1 | 1) => void
  moveActiveSource: (delta: -1 | 1) => void
  setActiveSourceId: (sourceId: string | null) => void
  setActiveItem: (sourceId: string, index: number) => void
}

function activeAfterRemoval(
  priorIds: string[],
  nextIds: string[],
  removedId: string,
  activeId: string | null,
): string | null {
  if (activeId !== removedId && activeId && nextIds.includes(activeId))
    return activeId
  const removedIndex = priorIds.indexOf(removedId)
  return (
    nextIds[Math.min(Math.max(removedIndex, 0), nextIds.length - 1)] ?? null
  )
}

function persistedTree(value: unknown): BspNode | null {
  const saved = value as { tree?: unknown; sourceIds?: unknown } | null
  return (
    sanitizeBspTree(saved?.tree) ??
    buildBspTree(sanitizeStoredSourceIds(saved?.sourceIds, DEFAULT_SOURCE_IDS))
  )
}

const initialTree = buildBspTree(legacySourceIds())

export const useReadingStore = create<ReadingState>()(
  persist(
    (set, get) => ({
      tree: initialTree,
      sourceIds: bspLeafIds(initialTree),
      activeSourceId: bspLeafIds(initialTree)[0] ?? null,
      activeItemBySource: {},
      setAvailableSources: (availableIds) =>
        set((state) => {
          const tree = sanitizeBspTree(state.tree, availableIds)
          const sourceIds = bspLeafIds(tree)
          return {
            tree,
            sourceIds,
            activeSourceId:
              state.activeSourceId && sourceIds.includes(state.activeSourceId)
                ? state.activeSourceId
                : (sourceIds[0] ?? null),
          }
        }),
      toggleSource: (sourceId, rootRect) => {
        if (!sourceId.trim()) return false
        const added = !get().sourceIds.includes(sourceId)
        if (added) {
          set((state) => {
            const tree = insertBspLeaf(
              state.tree,
              state.activeSourceId,
              sourceId,
              rootRect,
            )
            return {
              tree,
              sourceIds: bspLeafIds(tree),
              activeSourceId: sourceId,
              activeItemBySource: {
                ...state.activeItemBySource,
                [sourceId]: 0,
              },
            }
          })
        } else {
          get().removeSource(sourceId)
        }
        return added
      },
      removeSource: (sourceId) =>
        set((state) => {
          const tree = removeBspLeaf(state.tree, sourceId)
          const sourceIds = bspLeafIds(tree)
          const activeItemBySource = { ...state.activeItemBySource }
          delete activeItemBySource[sourceId]
          return {
            tree,
            sourceIds,
            activeSourceId: activeAfterRemoval(
              state.sourceIds,
              sourceIds,
              sourceId,
              state.activeSourceId,
            ),
            activeItemBySource,
          }
        }),
      moveSource: (sourceId, delta) =>
        set((state) => {
          const from = state.sourceIds.indexOf(sourceId)
          const to = from + delta
          if (from === -1 || to < 0 || to >= state.sourceIds.length)
            return state
          const tree = swapBspLeaves(state.tree, sourceId, state.sourceIds[to])
          return { tree, sourceIds: bspLeafIds(tree) }
        }),
      moveActiveSource: (delta) => {
        const activeSourceId = get().activeSourceId
        if (activeSourceId) get().moveSource(activeSourceId, delta)
      },
      setActiveSourceId: (activeSourceId) => set({ activeSourceId }),
      setActiveItem: (sourceId, index) =>
        set((state) => ({
          activeItemBySource: {
            ...state.activeItemBySource,
            [sourceId]: index,
          },
        })),
    }),
    {
      name: READING_PREFERENCES_KEY,
      version: 2,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        tree: state.tree,
        sourceIds: state.sourceIds,
        activeSourceId: state.activeSourceId,
      }),
      migrate: (persisted) => {
        const tree = persistedTree(persisted)
        const sourceIds = bspLeafIds(tree)
        const saved = persisted as { activeSourceId?: unknown } | null
        return {
          tree,
          sourceIds,
          activeSourceId:
            typeof saved?.activeSourceId === 'string' &&
            sourceIds.includes(saved.activeSourceId)
              ? saved.activeSourceId
              : (sourceIds[0] ?? null),
          activeItemBySource: {},
        }
      },
      merge: (persisted, current) => {
        const tree = persistedTree(persisted)
        const sourceIds = bspLeafIds(tree)
        const saved = persisted as Partial<ReadingState>
        return {
          ...current,
          tree,
          sourceIds,
          activeSourceId:
            saved.activeSourceId && sourceIds.includes(saved.activeSourceId)
              ? saved.activeSourceId
              : (sourceIds[0] ?? null),
          activeItemBySource: {},
        }
      },
    },
  ),
)
