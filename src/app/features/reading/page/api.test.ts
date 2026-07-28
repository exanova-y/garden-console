import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadCommunitySources } from './api'

describe('reading API client', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('loads the community source catalog as JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: 'hackernews',
            name: 'Hacker News',
            kind: 'json',
            adapter: 'hackernews',
            url: 'https://example.test/hackernews',
            homepage: 'https://news.ycombinator.com',
            category: 'tech',
            blurb: 'front page',
          },
        ]),
        { headers: { 'content-type': 'application/json; charset=utf-8' } },
      ),
    )

    await expect(loadCommunitySources()).resolves.toMatchObject([
      { id: 'hackernews' },
    ])
  })

  it('reports SPA fallthrough instead of parsing index.html as JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<!doctype html>', {
        headers: { 'content-type': 'text/html' },
      }),
    )

    await expect(loadCommunitySources()).rejects.toThrow(
      'Restart the integrated dev server with `pnpm dev`.',
    )
  })
})
