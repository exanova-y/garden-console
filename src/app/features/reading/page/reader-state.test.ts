import { describe, expect, it } from 'vitest'
import type { CommunitySourceDef } from './types'
import {
  bspLeafIds,
  buildBspTree,
  circularIndex,
  filterCommunitySources,
  findBspLeafRect,
  insertBspLeaf,
  moveSource,
  removeBspLeaf,
  sanitizeSourceIds,
  swapBspLeaves,
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

  it('builds a persistent longest-side BSP tree in insertion order', () => {
    expect(buildBspTree(['a', 'b', 'c', 'd'])).toEqual({
      kind: 'split',
      axis: 'vertical',
      ratio: 0.5,
      first: { kind: 'leaf', sourceId: 'a' },
      second: {
        kind: 'split',
        axis: 'horizontal',
        ratio: 0.5,
        first: { kind: 'leaf', sourceId: 'b' },
        second: {
          kind: 'split',
          axis: 'vertical',
          ratio: 0.5,
          first: { kind: 'leaf', sourceId: 'c' },
          second: { kind: 'leaf', sourceId: 'd' },
        },
      },
    })
  })

  it('fills the root with one source and splits the focused leaf by its longest side', () => {
    const first = insertBspLeaf(null, null, 'a', {
      x: 0,
      y: 0,
      width: 1200,
      height: 700,
    })
    expect(first).toEqual({ kind: 'leaf', sourceId: 'a' })

    const second = insertBspLeaf(first, 'a', 'b', {
      x: 0,
      y: 0,
      width: 1200,
      height: 700,
    })
    expect(second).toMatchObject({
      kind: 'split',
      axis: 'vertical',
      ratio: 0.5,
    })

    const third = insertBspLeaf(second, 'b', 'c', {
      x: 0,
      y: 0,
      width: 1200,
      height: 700,
    })
    expect(third).toMatchObject({
      second: {
        kind: 'split',
        axis: 'horizontal',
      },
    })
    expect(
      findBspLeafRect(third, 'a', {
        x: 0,
        y: 0,
        width: 1200,
        height: 700,
      }),
    ).toEqual({
      x: 0,
      y: 0,
      width: 600,
      height: 700,
    })
  })

  it('promotes a sibling when a source is removed', () => {
    const tree = buildBspTree(['a', 'b', 'c'])
    const next = removeBspLeaf(tree, 'c')
    expect(bspLeafIds(next)).toEqual(['a', 'b'])
    expect(next).toEqual({
      kind: 'split',
      axis: 'vertical',
      ratio: 0.5,
      first: { kind: 'leaf', sourceId: 'a' },
      second: { kind: 'leaf', sourceId: 'b' },
    })
  })

  it('reorders leaf payloads without rebuilding split topology', () => {
    const tree = buildBspTree(['a', 'b', 'c'])
    const next = swapBspLeaves(tree, 'a', 'b')
    expect(bspLeafIds(next)).toEqual(['b', 'a', 'c'])
    expect(next && next.kind === 'split' ? next.axis : null).toBe('vertical')
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
