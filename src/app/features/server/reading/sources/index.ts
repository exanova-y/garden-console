import { READING_LIST } from '../reading-list'
import type {
  CommunitySourceDef,
  SourceAdapter,
  SourceItem,
  SourcePollResult,
} from '../types'
import { getFeed } from './feed'
import { getHackerNews, normalizeHackerNews } from './hackernews'
import { parseDate } from './normalize'

type SourceGetter = (definition: CommunitySourceDef) => Promise<SourceItem[]>

const SOURCE_GETTERS: Partial<Record<SourceAdapter, SourceGetter>> = {
  'rss-atom': getFeed,
  hackernews: getHackerNews,
}

export { normalizeHackerNews, parseDate }

export async function fetchCommunityItems(
  sourceId: string,
): Promise<SourcePollResult> {
  const definition = READING_LIST.find((source) => source.id === sourceId)
  if (!definition) throw new Error(`unknown community source: ${sourceId}`)

  const getter = SOURCE_GETTERS[definition.adapter]
  if (!getter)
    throw new Error(
      `${definition.kind} adapter is not configured for ${sourceId}`,
    )

  return {
    source_id: definition.id,
    kind: definition.kind,
    adapter: definition.adapter,
    polled_at: Date.now(),
    items: await getter(definition),
  }
}
