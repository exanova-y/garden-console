import type { CommunitySourceDef } from './types'

export interface BspRect {
  x: number
  y: number
  width: number
  height: number
}

export type BspAxis = 'horizontal' | 'vertical'

export type BspNode =
  | { kind: 'leaf'; sourceId: string }
  | {
      kind: 'split'
      axis: BspAxis
      ratio: number
      first: BspNode
      second: BspNode
    }

export const DEFAULT_BSP_RECT: BspRect = {
  x: 0,
  y: 0,
  width: 1,
  height: 1,
}

function splitRatio(value: number): number {
  return Math.min(0.9, Math.max(0.1, value))
}

export function splitBspRect(
  rect: BspRect,
  axis: BspAxis,
  ratio: number,
): [BspRect, BspRect] {
  const cut = splitRatio(ratio)
  if (axis === 'vertical') {
    const firstWidth = rect.width * cut
    return [
      { ...rect, width: firstWidth },
      {
        x: rect.x + firstWidth,
        y: rect.y,
        width: rect.width - firstWidth,
        height: rect.height,
      },
    ]
  }

  const firstHeight = rect.height * cut
  return [
    { ...rect, height: firstHeight },
    {
      x: rect.x,
      y: rect.y + firstHeight,
      width: rect.width,
      height: rect.height - firstHeight,
    },
  ]
}

export function longestBspAxis(rect: BspRect): BspAxis {
  return rect.width >= rect.height ? 'vertical' : 'horizontal'
}

export function bspLeafIds(node: BspNode | null): string[] {
  if (!node) return []
  if (node.kind === 'leaf') return [node.sourceId]
  return [...bspLeafIds(node.first), ...bspLeafIds(node.second)]
}

export function findBspLeafRect(
  node: BspNode | null,
  sourceId: string,
  rect: BspRect,
): BspRect | null {
  if (!node) return null
  if (node.kind === 'leaf') return node.sourceId === sourceId ? rect : null

  const [firstRect, secondRect] = splitBspRect(rect, node.axis, node.ratio)
  return (
    findBspLeafRect(node.first, sourceId, firstRect) ??
    findBspLeafRect(node.second, sourceId, secondRect)
  )
}

export function insertBspLeaf(
  node: BspNode | null,
  targetSourceId: string | null,
  sourceId: string,
  rect: BspRect = DEFAULT_BSP_RECT,
): BspNode {
  if (!node) return { kind: 'leaf', sourceId }
  if (bspLeafIds(node).includes(sourceId)) return node

  const target =
    targetSourceId && bspLeafIds(node).includes(targetSourceId)
      ? targetSourceId
      : bspLeafIds(node)[0]

  function insert(current: BspNode, currentRect: BspRect): BspNode {
    if (current.kind === 'leaf') {
      if (current.sourceId !== target) return current
      return {
        kind: 'split',
        axis: longestBspAxis(currentRect),
        ratio: 0.5,
        first: current,
        second: { kind: 'leaf', sourceId },
      }
    }

    const [firstRect, secondRect] = splitBspRect(
      currentRect,
      current.axis,
      current.ratio,
    )
    return {
      ...current,
      first: insert(current.first, firstRect),
      second: insert(current.second, secondRect),
    }
  }

  return insert(node, rect)
}

export function removeBspLeaf(
  node: BspNode | null,
  sourceId: string,
): BspNode | null {
  if (!node) return null
  if (node.kind === 'leaf') return node.sourceId === sourceId ? null : node

  const first = removeBspLeaf(node.first, sourceId)
  const second = removeBspLeaf(node.second, sourceId)
  if (!first) return second
  if (!second) return first
  if (first === node.first && second === node.second) return node
  return { ...node, first, second }
}

export function swapBspLeaves(
  node: BspNode | null,
  firstId: string,
  secondId: string,
): BspNode | null {
  if (!node || firstId === secondId) return node
  if (node.kind === 'leaf') {
    if (node.sourceId === firstId) return { ...node, sourceId: secondId }
    if (node.sourceId === secondId) return { ...node, sourceId: firstId }
    return node
  }
  return {
    ...node,
    first: swapBspLeaves(node.first, firstId, secondId)!,
    second: swapBspLeaves(node.second, firstId, secondId)!,
  }
}

export function buildBspTree(
  sourceIds: string[],
  rect: BspRect = DEFAULT_BSP_RECT,
): BspNode | null {
  const ids = sanitizeStoredSourceIds(sourceIds)
  let tree: BspNode | null = null
  let focused: string | null = null
  for (const sourceId of ids) {
    tree = insertBspLeaf(tree, focused, sourceId, rect)
    focused = sourceId
  }
  return tree
}

export function sanitizeBspTree(
  value: unknown,
  availableIds?: Iterable<string>,
): BspNode | null {
  const available = availableIds ? new Set(availableIds) : null
  const seen = new Set<string>()

  function sanitize(node: unknown): BspNode | null {
    if (!node || typeof node !== 'object') return null
    const candidate = node as Record<string, unknown>
    if (candidate.kind === 'leaf') {
      const sourceId = candidate.sourceId
      if (
        typeof sourceId !== 'string' ||
        !sourceId.trim() ||
        seen.has(sourceId) ||
        (available && !available.has(sourceId))
      )
        return null
      seen.add(sourceId)
      return { kind: 'leaf', sourceId }
    }
    if (candidate.kind !== 'split') return null

    const first = sanitize(candidate.first)
    const second = sanitize(candidate.second)
    if (!first) return second
    if (!second) return first
    return {
      kind: 'split',
      axis: candidate.axis === 'horizontal' ? 'horizontal' : 'vertical',
      ratio:
        typeof candidate.ratio === 'number' && Number.isFinite(candidate.ratio)
          ? splitRatio(candidate.ratio)
          : 0.5,
      first,
      second,
    }
  }

  return sanitize(value)
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
  const normalize = (value: string) =>
    value
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
  const terms = normalize(query).split(/\s+/).filter(Boolean)
  if (terms.length === 0) return catalog

  return catalog.filter((source) => {
    const metadata = [
      source.id,
      source.name,
      source.category,
      source.blurb,
      source.kind,
      source.adapter,
      source.url,
      source.homepage,
    ]
    const searchable = normalize(metadata.join(' '))
    const compactSearchable = searchable.replace(/\s+/g, '')
    return terms.every(
      (term) =>
        searchable.includes(term) ||
        compactSearchable.includes(term.replace(/\s+/g, '')),
    )
  })
}
