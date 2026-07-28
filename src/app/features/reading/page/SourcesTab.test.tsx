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
import {
  defaultReadingKeybindSettings,
  READING_KEYBINDINGS_KEY,
} from './keybindings'
import { READING_PREFERENCES_KEY, useReadingStore } from './reading-store'
import { buildBspTree } from './reader-state'
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
    {
      title: 'HN without date',
      url: 'https://example.com/hn-undated',
      published_at: null,
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
    tree: buildBspTree(['hackernews']),
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
  it('migrates persisted source IDs into a BSP tree', async () => {
    localStorage.setItem(
      READING_PREFERENCES_KEY,
      JSON.stringify({
        version: 1,
        state: {
          sourceIds: ['hackernews', 'producthunt'],
          activeSourceId: 'producthunt',
        },
      }),
    )

    await useReadingStore.persist.rehydrate()

    expect(useReadingStore.getState()).toMatchObject({
      sourceIds: ['hackernews', 'producthunt'],
      activeSourceId: 'producthunt',
      tree: {
        kind: 'split',
        axis: 'vertical',
        ratio: 0.5,
      },
    })
  })

  it('renders an idle source and polls only after an explicit action', async () => {
    const user = userEvent.setup()
    renderTab()

    expect(await screen.findByText(/not polled/)).toBeVisible()
    expect(api.loadCommunityItems).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(
        document.querySelector('[data-connector-runtime]'),
      ).toHaveTextContent('"state": "not_polled"')
    })

    await user.click(screen.getByTitle('Poll source'))

    expect(await screen.findByRole('link', { name: /HN one/ })).toBeVisible()
    expect(
      screen
        .getByRole('link', { name: 'HN without date' })
        .querySelector('time'),
    ).toBeNull()
    expect(api.loadCommunityItems).toHaveBeenCalledTimes(1)
  })

  it('adds a reading-list source without polling it automatically', async () => {
    const user = userEvent.setup()
    renderTab()
    await screen.findByText(/not polled/)

    await user.click(screen.getByRole('button', { name: '+ source' }))
    const search = screen.getByRole('textbox', {
      name: 'Search community sources',
    })
    await user.type(search, 'producthunt')
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
    expect(document.querySelector('.bsp-vertical')).not.toBeNull()
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

  it('always opens source search with Control+K', async () => {
    renderTab()
    await screen.findByText(/not polled/)

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })

    expect(
      screen.getByRole('textbox', { name: 'Search community sources' }),
    ).toBeVisible()
  })

  it('uses arrow keys and Enter to choose a source after Control+K', async () => {
    const user = userEvent.setup()
    renderTab()
    await screen.findByText(/not polled/)

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    const search = screen.getByRole('textbox', {
      name: 'Search community sources',
    })
    expect(search).toHaveAttribute(
      'aria-activedescendant',
      'catalog-source-hackernews',
    )

    await user.keyboard('{ArrowDown}')
    expect(search).toHaveAttribute(
      'aria-activedescendant',
      'catalog-source-producthunt',
    )

    await user.keyboard('{Enter}')
    expect(
      document.querySelector('[data-source-panel="producthunt"]'),
    ).not.toBeNull()
  })

  it('shows catalog loading failures and retries instead of reporting no result', async () => {
    const user = userEvent.setup()
    api.loadCommunitySources.mockRejectedValueOnce(
      new Error('catalog unavailable'),
    )
    renderTab()

    await user.click(screen.getByRole('button', { name: '+ source' }))
    expect(await screen.findByText('reading list unavailable')).toBeVisible()
    expect(screen.getByText('catalog unavailable')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'retry' }))
    expect((await screen.findAllByText('Hacker News')).length).toBeGreaterThan(
      0,
    )
  })

  it('polls all visible panels and navigates them with shortcuts', async () => {
    localStorage.setItem(
      READING_KEYBINDINGS_KEY,
      JSON.stringify({
        ...defaultReadingKeybindSettings(),
        enabled: true,
      }),
    )
    useReadingStore.setState({
      tree: buildBspTree(['hackernews', 'producthunt']),
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

  it('keeps connectors out of the sidebar and exposes them in source search', async () => {
    const user = userEvent.setup()
    renderTab()
    await screen.findByText(/not polled/)

    expect(screen.queryByRole('button', { name: /gmail/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /feedly/i })).toBeNull()

    await user.click(screen.getByRole('button', { name: '+ source' }))
    const search = screen.getByRole('textbox', {
      name: 'Search community sources',
    })
    await user.clear(search)
    await user.type(search, 'gmail')

    expect(screen.getAllByText('Gmail').length).toBeGreaterThan(0)
    expect(
      screen.getAllByText('messages through the Gmail JSON API').length,
    ).toBeGreaterThan(0)
  })

  it('edits and saves Vimium-safe keybind settings in the sidebar', async () => {
    const user = userEvent.setup()
    renderTab()
    await screen.findByText(/not polled/)

    await user.click(screen.getAllByRole('button', { name: 'keys' })[0])
    expect(screen.getByText('vimium-safe / off')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'edit mode' }))
    await user.click(
      screen.getByRole('checkbox', { name: 'enable reader keybinds' }),
    )
    const openBinding = screen.getByRole('textbox', {
      name: 'open hovered / focused link keybind',
    })
    await user.clear(openBinding)
    await user.type(openBinding, 'v')
    await user.click(screen.getByRole('button', { name: 'save' }))

    expect(screen.getByText('enabled')).toBeVisible()
    expect(
      JSON.parse(localStorage.getItem(READING_KEYBINDINGS_KEY) ?? '{}'),
    ).toMatchObject({
      enabled: true,
      bindings: { openHovered: 'v', closeHovered: 'x' },
    })
  })

  it('opens hovered links with o and closes hovered panels with x when enabled', async () => {
    localStorage.setItem(
      READING_KEYBINDINGS_KEY,
      JSON.stringify({
        ...defaultReadingKeybindSettings(),
        enabled: true,
      }),
    )
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const user = userEvent.setup()
    renderTab()
    await screen.findByText(/not polled/)
    await user.click(screen.getByTitle('Poll source'))

    const link = await screen.findByRole('link', { name: /HN two/ })
    fireEvent.mouseEnter(link)
    fireEvent.keyDown(window, { key: 'o' })
    expect(open).toHaveBeenCalledWith(
      'https://example.com/hn-two',
      '_blank',
      'noopener,noreferrer',
    )

    fireEvent.keyDown(window, { key: 'x' })
    expect(
      document.querySelector('[data-source-panel="hackernews"]'),
    ).toBeNull()
    open.mockRestore()
  })

  it('polls one panel without polling the other', async () => {
    const user = userEvent.setup()
    useReadingStore.setState({
      tree: buildBspTree(['hackernews', 'producthunt']),
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
