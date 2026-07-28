import type { SourceItem } from '../types'

export function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return []
  return Array.isArray(value) ? value : [value]
}

export function parseDate(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 10_000_000_000 ? Math.floor(value / 1000) : Math.floor(value)
  }
  if (typeof value !== 'string' || !value) return null
  const time = Date.parse(value)
  return Number.isFinite(time) ? Math.floor(time / 1000) : null
}

export function sortItems(items: SourceItem[]): SourceItem[] {
  return items
    .filter((item) => item.title.trim().length > 0)
    .sort((a, b) => (b.published_at ?? 0) - (a.published_at ?? 0))
}
