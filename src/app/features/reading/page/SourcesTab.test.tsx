// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SourcesTab } from './SourcesTab'
import { READING_PREFERENCES_KEY, useReadingStore } from './reading-store'
import type { CommunitySourceDef, SourceItem, SourcePollResult } from './types'

const api = vi.hoisted(() => ({
  beginConnector: vi.fn(),
  loadCommunityItems: vi.fn(),
  loadCommunitySources: vi.fn(),
  loadConnectorStatus: vi.fn(),
  loadReadingItems: vi.fn(),
  pollConnectors: vi.fn(),
}))

vi.mock('./api', () => api)

const READING_LIST: CommunitySourceDef[] = [
  {
    id: 'hackernews',
    name: 'Hacker News',
    kind: 'json',
    adapter: 'hackernews',
    url: 'https://example.com/hn',
    homepage: 'https://news.ycombinator.com',
    category: 'tech',
    blurb: 'front page via JSON',
  },
  {
    id: 'producthunt',
    name: 'Product Hunt',
    kind: 'rss',
    adapter: 'rss-atom',
    url: 'https://example.com/feed',
    homepage: 'https://producthunt.com',
    category: 'products',
    blurb: 'product launches via RSS',
  },
]

const ITEMS: Record<string, SourceItem[]> = {
  hackernews: [
    {
      title: 'HN one',
      url: 'https://example.com/hn-one',
      published_at: 20,
    },
    {
      title: 'HN two',
      url: 'https://example.com/hn-two',
      published_at: 10,
    },
  ],
  producthunt: [
    {
      title: 'Product one',
      url: 'https://example.com/product-one',
      published_at: 20,
    },
    {
      title: 'Product two',
      url: 'https://example.com/product-two',
      published_at: 10,
    },
  ],
}

function pollResult(sourceId: string): SourcePollResult {
  const source = READING_LIST.find((entry) => entry.id === sourceId)!
  return {
    source_id: sourceId,
    kind: source.kind,
    adapter: source.adapter,
    polled_at: 100,
    items: ITEMS[sourceId],
  }
}

function renderTab() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Infinity,
        refetchOnMount: false,
        refetchOnReconnect: false,
        refetchOnWindowFocus: false,
      },
    },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <SourcesTab />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  useReadingStore.setState({
    sourceIds: ['hackernews'],
    activeSourceId: 'hackernews',
    activeItemBySource: {},
  })
  api.loadCommunitySources.mockResolvedValue(READING_LIST)
  api.loadConnectorStatus.mockResolvedValue([])
  api.loadReadingItems.mockResolvedValue([])
  api.loadCommunityItems.mockImplementation(async (sourceId: string) =>
    pollResult(sourceId),
  )
  HTMLElement.prototype.scrollIntoView = vi.fn()
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('SourcesTab manual runtime flow', () => {
  it('renders an idle source and polls only after an explicit action', async () => {
    const user = userEvent.setup()
    renderTab()

    expect(await screen.findByText(/not polled/)).toBeVisible()
    expect(api.loadCommunityItems).not.toHaveBeenCalled()

    await user.click(screen.getByTitle('Poll source'))

    expect(await screen.findByRole('link', { name: /HN one/ })).toBeVisible()
    expect(api.loadCommunityItems).toHaveBeenCalledTimes(1)
  })

  it('adds a reading-list source without polling it automatically', async () => {
    const user = userEvent.setup()
    renderTab()
    await screen.findByText(/not polled/)

    fireEvent.keyDown(window, { key: '/' })
    const search = screen.getByRole('textbox', {
      name: 'Search community sources',
    })
    await user.type(search, 'product rss')
    await user.keyboard('{Enter}')

    expect(
      screen.getByRole('dialog', { name: 'Add a reading source' }),
    ).toBeVisible()
    expect(api.loadCommunityItems).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'done' }))
    const productHunt = document.querySelector(
      '[data-source-panel="producthunt"]',
    )
    expect(productHunt).not.toBeNull()
    await user.click(
      within(productHunt as HTMLElement).getByTitle('Poll source'),
    )
    expect(
      await screen.findByRole('link', { name: /Product one/ }),
    ).toBeVisible()

    const persisted = JSON.parse(
      localStorage.getItem(READING_PREFERENCES_KEY) ?? '{}',
    ) as { state?: { sourceIds?: string[] } }
    expect(persisted.state?.sourceIds).toEqual(['hackernews', 'producthunt'])
  })

  it('polls all visible panels and navigates them with shortcuts', async () => {
    useReadingStore.setState({
      sourceIds: ['hackernews', 'producthunt'],
      activeSourceId: 'hackernews',
      activeItemBySource: {},
    })
    renderTab()
    await screen.findAllByText(/not polled/)

    fireEvent.keyDown(window, { key: 'R' })
    await screen.findByRole('link', { name: /Product two/ })

    fireEvent.keyDown(window, { key: 'K' })
    expect(
      document.querySelector('[data-source-panel="producthunt"]'),
    ).toHaveClass('active')

    fireEvent.keyDown(window, { key: 'j' })
    expect(screen.getByRole('link', { name: /Product two/ })).toHaveClass(
      'active',
    )
  })

  it('polls one panel without polling the other', async () => {
    const user = userEvent.setup()
    useReadingStore.setState({
      sourceIds: ['hackernews', 'producthunt'],
      activeSourceId: 'hackernews',
      activeItemBySource: {},
    })
    renderTab()
    await screen.findAllByText(/not polled/)

    const hackerNews = document.querySelector(
      '[data-source-panel="hackernews"]',
    )
    expect(hackerNews).not.toBeNull()
    await user.click(
      within(hackerNews as HTMLElement).getByTitle('Poll source'),
    )

    await waitFor(() => {
      const calls = api.loadCommunityItems.mock.calls.map(([id]) => id)
      expect(calls.filter((id) => id === 'hackernews')).toHaveLength(1)
      expect(calls.filter((id) => id === 'producthunt')).toHaveLength(0)
    })
  })
})
