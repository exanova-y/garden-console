import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchCommunityItems,
  normalizeHackerNews,
  parseDate,
} from './source-fetch'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('community source normalization', () => {
  it('normalizes and orders Hacker News API hits', () => {
    const items = normalizeHackerNews({
      hits: [
        {
          title: 'older',
          url: 'https://example.com/older',
          created_at_i: 10,
        },
        {
          title: 'newer',
          objectID: '42',
          created_at_i: 20,
        },
        { title: '', created_at_i: 30 },
      ],
    })

    expect(items).toEqual([
      {
        title: 'newer',
        url: 'https://news.ycombinator.com/item?id=42',
        published_at: 20,
      },
      {
        title: 'older',
        url: 'https://example.com/older',
        published_at: 10,
      },
    ])
  })

  it('parses Atom entries and alternate links', async () => {
    const xml = `<feed>
      <entry>
        <title>older paper</title>
        <link rel="alternate" href="https://example.com/older" />
        <updated>2026-07-25T10:00:00Z</updated>
      </entry>
      <entry>
        <title>new paper</title>
        <link href="https://example.com/new" />
        <published>2026-07-26T10:00:00Z</published>
      </entry>
    </feed>`
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(xml, { status: 200 })),
    )

    await expect(fetchCommunityItems('producthunt')).resolves.toEqual([
      {
        title: 'new paper',
        url: 'https://example.com/new',
        published_at: parseDate('2026-07-26T10:00:00Z'),
      },
      {
        title: 'older paper',
        url: 'https://example.com/older',
        published_at: parseDate('2026-07-25T10:00:00Z'),
      },
    ])
  })

  it('normalizes numeric timestamps as seconds or milliseconds', () => {
    expect(parseDate(1_752_000_000)).toBe(1_752_000_000)
    expect(parseDate(1_752_000_000_000)).toBe(1_752_000_000)
  })
})
