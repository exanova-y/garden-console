import type { CommunitySourceDef } from './types'

export type BspNode =
  | { kind: 'leaf'; sourceId: string }
  | {
      kind: 'split'
      direction: 'columns' | 'rows'
      first: BspNode
      second: BspNode
    }

export function buildBspLayout(sourceIds: string[], depth = 0): BspNode | null {
  if (sourceIds.length === 0) return null
  if (sourceIds.length === 1) return { kind: 'leaf', sourceId: sourceIds[0] }

  const midpoint = Math.ceil(sourceIds.length / 2)
  const first = buildBspLayout(sourceIds.slice(0, midpoint), depth + 1)
  const second = buildBspLayout(sourceIds.slice(midpoint), depth + 1)
  if (!first || !second) return first ?? second

  return {
    kind: 'split',
    direction: depth % 2 === 0 ? 'columns' : 'rows',
    first,
    second,
  }
}

export function sanitizeSourceIds(
  value: unknown,
  availableIds: Iterable<string>,
  fallback: string[] = [],
): string[] {
  const available = new Set(availableIds)
  const sourceIds = Array.isArray(value) ? value : fallback
  return sourceIds.reduce<string[]>((result, candidate) => {
    if (
      typeof candidate === 'string' &&
      available.has(candidate) &&
      !result.includes(candidate)
    )
      result.push(candidate)
    return result
  }, [])
}

export function sanitizeStoredSourceIds(
  value: unknown,
  fallback: string[] = [],
): string[] {
  const sourceIds = Array.isArray(value) ? value : fallback
  return sourceIds.reduce<string[]>((result, candidate) => {
    if (
      typeof candidate === 'string' &&
      candidate.trim().length > 0 &&
      !result.includes(candidate)
    )
      result.push(candidate)
    return result
  }, [])
}

export function moveSource(
  sourceIds: string[],
  sourceId: string,
  delta: -1 | 1,
): string[] {
  const from = sourceIds.indexOf(sourceId)
  if (from === -1) return sourceIds
  const to = from + delta
  if (to < 0 || to >= sourceIds.length) return sourceIds

  const next = [...sourceIds]
  ;[next[from], next[to]] = [next[to], next[from]]
  return next
}

export function circularIndex(
  current: number,
  delta: number,
  length: number,
): number {
  if (length <= 0) return 0
  return (((current + delta) % length) + length) % length
}

export function filterCommunitySources(
  catalog: CommunitySourceDef[],
  query: string,
): CommunitySourceDef[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return catalog

  return catalog.filter((source) => {
    const searchable =
      `${source.name} ${source.category} ${source.blurb} ${source.kind}`.toLowerCase()
    return terms.every((term) => searchable.includes(term))
  })
}
