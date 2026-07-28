import { describe, expect, it } from 'vitest'
import type { CommunitySourceDef } from './types'
import {
  buildBspLayout,
  circularIndex,
  filterCommunitySources,
  moveSource,
  sanitizeSourceIds,
} from './reader-state'

const READING_LIST: CommunitySourceDef[] = [
  {
    id: 'hackernews',
    name: 'Hacker News',
    kind: 'json',
    adapter: 'hackernews',
    url: 'https://example.com/hn',
    homepage: 'https://news.ycombinator.com',
    category: 'tech',
    blurb: 'front page JSON',
  },
  {
    id: 'producthunt',
    name: 'Product Hunt',
    kind: 'rss',
    adapter: 'rss-atom',
    url: 'https://example.com/feed',
    homepage: 'https://producthunt.com',
    category: 'products',
    blurb: 'product RSS',
  },
]

describe('reader source state', () => {
  it('sanitizes persisted IDs while preserving order', () => {
    expect(
      sanitizeSourceIds(
        ['producthunt', 'missing', 'hackernews', 'producthunt'],
        ['hackernews', 'producthunt'],
      ),
    ).toEqual(['producthunt', 'hackernews'])
  })

  it('builds a balanced alternating BSP tree', () => {
    expect(buildBspLayout(['a', 'b', 'c', 'd'])).toEqual({
      kind: 'split',
      direction: 'columns',
      first: {
        kind: 'split',
        direction: 'rows',
        first: { kind: 'leaf', sourceId: 'a' },
        second: { kind: 'leaf', sourceId: 'b' },
      },
      second: {
        kind: 'split',
        direction: 'rows',
        first: { kind: 'leaf', sourceId: 'c' },
        second: { kind: 'leaf', sourceId: 'd' },
      },
    })
  })

  it('moves a source without mutating the input order', () => {
    const sourceIds = ['a', 'b', 'c']
    expect(moveSource(sourceIds, 'b', -1)).toEqual(['b', 'a', 'c'])
    expect(sourceIds).toEqual(['a', 'b', 'c'])
    expect(moveSource(sourceIds, 'a', -1)).toBe(sourceIds)
  })

  it('wraps source and catalog navigation', () => {
    expect(circularIndex(0, -1, 3)).toBe(2)
    expect(circularIndex(2, 1, 3)).toBe(0)
    expect(circularIndex(3, 1, 0)).toBe(0)
  })

  it('searches all catalog terms across source metadata', () => {
    expect(
      filterCommunitySources(READING_LIST, 'product rss').map(
        (source) => source.id,
      ),
    ).toEqual(['producthunt'])
    expect(
      filterCommunitySources(READING_LIST, 'hackernews').map(
        (source) => source.id,
      ),
    ).toEqual(['hackernews'])
    expect(
      filterCommunitySources(READING_LIST, 'news.ycombinator.com').map(
        (source) => source.id,
      ),
    ).toEqual(['hackernews'])
    expect(
      filterCommunitySources(READING_LIST, 'example.com/feed').map(
        (source) => source.id,
      ),
    ).toEqual(['producthunt'])
    expect(filterCommunitySources(READING_LIST, 'not present')).toEqual([])
  })
})
