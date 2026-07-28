import { describe, expect, it } from 'vitest'
import {
  defaultReadingKeybindSettings,
  findReadingKeybindAction,
  sanitizeReadingKeybindSettings,
} from './keybindings'

describe('reader keybindings', () => {
  it('is disabled by default so browser extensions retain their keys', () => {
    const settings = defaultReadingKeybindSettings()

    expect(settings.enabled).toBe(false)
    expect(findReadingKeybindAction(settings, 'o', 'o')).toBeNull()
    expect(settings.bindings).toMatchObject({
      openHovered: 'o',
      closeHovered: 'x',
    })
  })

  it('matches configured single keys and sequences when enabled', () => {
    const settings = {
      ...defaultReadingKeybindSettings(),
      enabled: true,
    }

    expect(findReadingKeybindAction(settings, 'o', 'o')).toBe('openHovered')
    expect(findReadingKeybindAction(settings, 'g', 'gg')).toBe('firstItem')
  })

  it('sanitizes malformed persisted settings', () => {
    expect(
      sanitizeReadingKeybindSettings({
        enabled: true,
        bindings: { openHovered: '  v  ', closeHovered: 4 },
      }),
    ).toMatchObject({
      enabled: true,
      bindings: { openHovered: 'v', closeHovered: 'x' },
    })
  })
})
