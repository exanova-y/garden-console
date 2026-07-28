import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { moveSource, sanitizeStoredSourceIds } from './reader-state'

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
  sourceIds: string[]
  activeSourceId: string | null
  activeItemBySource: Record<string, number>
  setSourceIds: (update: string[] | ((current: string[]) => string[])) => void
  toggleSource: (sourceId: string) => boolean
  removeSource: (sourceId: string) => void
  moveActiveSource: (delta: -1 | 1) => void
  setActiveSourceId: (sourceId: string | null) => void
  setActiveItem: (sourceId: string, index: number) => void
}

function validSourceIds(sourceIds: string[]): string[] {
  return sanitizeStoredSourceIds(sourceIds, DEFAULT_SOURCE_IDS)
}

export const useReadingStore = create<ReadingState>()(
  persist(
    (set, get) => {
      const sourceIds = legacySourceIds()
      return {
        sourceIds,
        activeSourceId: sourceIds[0] ?? null,
        activeItemBySource: {},
        setSourceIds: (update) =>
          set((state) => {
            const next = validSourceIds(
              typeof update === 'function' ? update(state.sourceIds) : update,
            )
            return {
              sourceIds: next,
              activeSourceId:
                state.activeSourceId && next.includes(state.activeSourceId)
                  ? state.activeSourceId
                  : (next[0] ?? null),
            }
          }),
        toggleSource: (sourceId) => {
          if (!sourceId.trim()) return false
          const added = !get().sourceIds.includes(sourceId)
          set((state) => ({
            sourceIds: added
              ? [...state.sourceIds, sourceId]
              : state.sourceIds.filter((id) => id !== sourceId),
            activeSourceId: added ? sourceId : state.activeSourceId,
            activeItemBySource: added
              ? { ...state.activeItemBySource, [sourceId]: 0 }
              : state.activeItemBySource,
          }))
          if (!added && get().activeSourceId === sourceId) {
            const remaining = get().sourceIds
            set({ activeSourceId: remaining[0] ?? null })
          }
          return added
        },
        removeSource: (sourceId) =>
          set((state) => {
            const index = state.sourceIds.indexOf(sourceId)
            const sourceIds = state.sourceIds.filter((id) => id !== sourceId)
            return {
              sourceIds,
              activeSourceId:
                state.activeSourceId === sourceId
                  ? (sourceIds[Math.min(index, sourceIds.length - 1)] ?? null)
                  : state.activeSourceId,
            }
          }),
        moveActiveSource: (delta) =>
          set((state) => ({
            sourceIds: state.activeSourceId
              ? moveSource(state.sourceIds, state.activeSourceId, delta)
              : state.sourceIds,
          })),
        setActiveSourceId: (activeSourceId) => set({ activeSourceId }),
        setActiveItem: (sourceId, index) =>
          set((state) => ({
            activeItemBySource: {
              ...state.activeItemBySource,
              [sourceId]: index,
            },
          })),
      }
    },
    {
      name: READING_PREFERENCES_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ sourceIds: state.sourceIds }),
      merge: (persisted, current) => {
        const stored = persisted as Partial<ReadingState>
        const sourceIds = validSourceIds(stored.sourceIds ?? current.sourceIds)
        return {
          ...current,
          ...stored,
          sourceIds,
          activeSourceId: sourceIds[0] ?? null,
          activeItemBySource: {},
        }
      },
    },
  ),
)
