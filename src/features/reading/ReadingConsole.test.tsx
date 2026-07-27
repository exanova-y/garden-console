// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
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
import { COMMUNITY_SOURCES } from './catalog'
import { ReadingConsole } from './ReadingConsole'

const client = vi.hoisted(() => ({
  beginConnector: vi.fn(),
  loadCommunityItems: vi.fn(),
  loadCommunitySources: vi.fn(),
  loadConnectorStatus: vi.fn(),
  refreshReading: vi.fn(),
}))

vi.mock('./client', () => client)

beforeEach(() => {
  localStorage.clear()
  client.loadCommunitySources.mockResolvedValue(COMMUNITY_SOURCES)
  client.loadConnectorStatus.mockResolvedValue([])
  client.loadCommunityItems.mockImplementation(async (sourceId: string) => {
    if (sourceId === 'producthunt')
      return [
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
      ]
    return [
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
    ]
  })
  HTMLElement.prototype.scrollIntoView = vi.fn()
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('ReadingConsole interactions', () => {
  it('loads the persisted default source and keeps its items visible', async () => {
    render(<ReadingConsole />)

    expect(await screen.findByRole('link', { name: /HN one/ })).toBeVisible()
    expect(client.loadCommunityItems).toHaveBeenCalledWith(
      'hackernews',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it('uses the command catalog to add a source without closing the window', async () => {
    const user = userEvent.setup()
    render(<ReadingConsole />)
    await screen.findByRole('link', { name: /HN one/ })

    fireEvent.keyDown(window, { key: '/' })
    const search = screen.getByRole('textbox', {
      name: 'Search community sources',
    })
    await user.type(search, 'product atom')
    await user.keyboard('{Enter}')

    expect(
      screen.getByRole('dialog', { name: 'Add a reading source' }),
    ).toBeVisible()
    expect(screen.getByRole('button', { name: '− remove' })).toBeVisible()
    expect(
      await screen.findByRole('link', { name: /Product one/ }),
    ).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'done' }))
    expect(
      screen.queryByRole('dialog', { name: 'Add a reading source' }),
    ).not.toBeInTheDocument()
    expect(
      JSON.parse(
        localStorage.getItem('peacesign-reading-community-sources') ?? '[]',
      ),
    ).toEqual(['hackernews', 'producthunt'])
  })

  it('navigates links and source panels with reader shortcuts', async () => {
    localStorage.setItem(
      'peacesign-reading-community-sources',
      JSON.stringify(['hackernews', 'producthunt']),
    )
    render(<ReadingConsole />)
    await screen.findByRole('link', { name: /Product two/ })

    fireEvent.keyDown(window, { key: 'K' })
    expect(
      document.querySelector('[data-source-panel="producthunt"]'),
    ).toHaveClass('active')

    fireEvent.keyDown(window, { key: 'j' })
    expect(screen.getByRole('link', { name: /Product two/ })).toHaveClass(
      'active',
    )

    fireEvent.keyDown(window, { key: 'K' })
    expect(
      document.querySelector('[data-source-panel="hackernews"]'),
    ).toHaveClass('active')
  })

  it('refreshes one panel without refetching every source', async () => {
    const user = userEvent.setup()
    localStorage.setItem(
      'peacesign-reading-community-sources',
      JSON.stringify(['hackernews', 'producthunt']),
    )
    render(<ReadingConsole />)
    await screen.findByRole('link', { name: /Product one/ })

    const hackerNews = document.querySelector(
      '[data-source-panel="hackernews"]',
    )
    expect(hackerNews).not.toBeNull()
    await user.click(
      within(hackerNews as HTMLElement).getByTitle('Refresh source'),
    )

    await waitFor(() => {
      const calls = client.loadCommunityItems.mock.calls.map(([id]) => id)
      expect(calls.filter((id) => id === 'hackernews')).toHaveLength(2)
      expect(calls.filter((id) => id === 'producthunt')).toHaveLength(1)
    })
  })
})
