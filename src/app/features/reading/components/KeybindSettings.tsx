import { useEffect, useMemo, useState } from 'react'
import {
  READING_KEYBIND_ACTIONS,
  type ReadingKeybindSettings,
} from '../page/keybindings'

export function KeybindSettings({
  open,
  settings,
  onClose,
  onSave,
}: {
  open: boolean
  settings: ReadingKeybindSettings
  onClose: () => void
  onSave: (settings: ReadingKeybindSettings) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(settings)

  useEffect(() => {
    if (!open) return
    setEditing(false)
    setDraft(settings)
  }, [open, settings])

  const duplicates = useMemo(() => {
    const counts = new Map<string, number>()
    for (const binding of Object.values(draft.bindings)) {
      if (binding) counts.set(binding, (counts.get(binding) ?? 0) + 1)
    }
    return new Set(
      [...counts.entries()]
        .filter(([, count]) => count > 1)
        .map(([binding]) => binding),
    )
  }, [draft.bindings])

  if (!open) return null

  function save() {
    onSave(draft)
    setEditing(false)
  }

  return (
    <section className="keybind-settings" aria-label="Reading keybinds">
      <header className="keybind-settings-head">
        <div>
          <strong>keybinds</strong>
          <small>{settings.enabled ? 'enabled' : 'vimium-safe / off'}</small>
        </div>
        <div>
          {editing ? (
            <button onClick={save}>save</button>
          ) : (
            <button onClick={() => setEditing(true)}>edit mode</button>
          )}
          <button onClick={onClose}>×</button>
        </div>
      </header>

      <p className="keybind-note">
        Off by default so Vimium keeps its keys. Hovering a link or panel sets
        the target for open and close.
      </p>

      {editing && (
        <label className="keybind-enabled">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                enabled: event.target.checked,
              }))
            }
          />
          enable reader keybinds
        </label>
      )}

      <div className="keybind-list">
        {READING_KEYBIND_ACTIONS.map(({ id, label }) => {
          const binding = draft.bindings[id]
          return (
            <label className="keybind-row" key={id}>
              <span>{label}</span>
              {editing ? (
                <input
                  aria-label={`${label} keybind`}
                  className={duplicates.has(binding) ? 'duplicate' : ''}
                  value={binding}
                  maxLength={12}
                  placeholder="disabled"
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      bindings: {
                        ...current.bindings,
                        [id]: event.target.value,
                      },
                    }))
                  }
                />
              ) : (
                <kbd>{settings.bindings[id] || '—'}</kbd>
              )}
            </label>
          )
        })}
      </div>
      {editing && duplicates.size > 0 && (
        <small className="keybind-warning">
          Duplicate keys run the first matching action.
        </small>
      )}
    </section>
  )
}
