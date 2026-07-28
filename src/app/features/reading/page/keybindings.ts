export const READING_KEYBINDINGS_KEY = 'peacesign-reading-keybindings'

export const READING_KEYBIND_ACTIONS = [
  { id: 'openHovered', label: 'open hovered / focused link', initial: 'o' },
  { id: 'closeHovered', label: 'close hovered source panel', initial: 'x' },
  { id: 'nextItem', label: 'next link', initial: 'j' },
  { id: 'previousItem', label: 'previous link', initial: 'k' },
  { id: 'firstItem', label: 'first link', initial: 'gg' },
  { id: 'lastItem', label: 'last link', initial: 'G' },
  { id: 'previousSource', label: 'previous source panel', initial: 'J' },
  { id: 'nextSource', label: 'next source panel', initial: 'K' },
  { id: 'moveSourceEarlier', label: 'move source earlier', initial: '[' },
  { id: 'moveSourceLater', label: 'move source later', initial: ']' },
  { id: 'copyUrl', label: 'copy focused URL', initial: 'yy' },
  { id: 'pollSource', label: 'poll focused source', initial: 'r' },
  { id: 'pollAll', label: 'poll all sources', initial: 'R' },
  { id: 'openCatalog', label: 'open source search', initial: '/' },
  { id: 'showKeybinds', label: 'show keybinds', initial: '?' },
] as const

export type ReadingKeybindAction =
  (typeof READING_KEYBIND_ACTIONS)[number]['id']

export interface ReadingKeybindSettings {
  enabled: boolean
  bindings: Record<ReadingKeybindAction, string>
}

export function defaultReadingKeybindSettings(): ReadingKeybindSettings {
  return {
    enabled: false,
    bindings: Object.fromEntries(
      READING_KEYBIND_ACTIONS.map(({ id, initial }) => [id, initial]),
    ) as Record<ReadingKeybindAction, string>,
  }
}

export function sanitizeReadingKeybindSettings(
  value: unknown,
): ReadingKeybindSettings {
  const defaults = defaultReadingKeybindSettings()
  if (!value || typeof value !== 'object') return defaults

  const saved = value as {
    enabled?: unknown
    bindings?: Record<string, unknown>
  }

  return {
    enabled: saved.enabled === true,
    bindings: Object.fromEntries(
      READING_KEYBIND_ACTIONS.map(({ id }) => [
        id,
        typeof saved.bindings?.[id] === 'string'
          ? saved.bindings[id].trim()
          : defaults.bindings[id],
      ]),
    ) as Record<ReadingKeybindAction, string>,
  }
}

export function loadReadingKeybindSettings(): ReadingKeybindSettings {
  if (typeof localStorage === 'undefined')
    return defaultReadingKeybindSettings()
  try {
    return sanitizeReadingKeybindSettings(
      JSON.parse(localStorage.getItem(READING_KEYBINDINGS_KEY) ?? 'null'),
    )
  } catch {
    return defaultReadingKeybindSettings()
  }
}

export function saveReadingKeybindSettings(
  settings: ReadingKeybindSettings,
): void {
  localStorage.setItem(READING_KEYBINDINGS_KEY, JSON.stringify(settings))
}

export function findReadingKeybindAction(
  settings: ReadingKeybindSettings,
  key: string,
  sequence: string,
): ReadingKeybindAction | null {
  if (!settings.enabled) return null

  return (
    READING_KEYBIND_ACTIONS.find(({ id }) => {
      const binding = settings.bindings[id]
      return binding !== '' && (binding === sequence || binding === key)
    })?.id ?? null
  )
}

export function eventKey(event: KeyboardEvent): string {
  const key = event.key.length === 1 ? event.key : event.key.toLowerCase()
  const modifiers = [
    event.metaKey || event.ctrlKey ? 'Mod' : '',
    event.altKey ? 'Alt' : '',
    event.shiftKey && event.key.length > 1 ? 'Shift' : '',
  ].filter(Boolean)

  return modifiers.length > 0 ? `${modifiers.join('+')}+${key}` : key
}
