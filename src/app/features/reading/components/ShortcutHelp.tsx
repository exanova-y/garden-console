const SHORTCUTS = [
  ['j / k', 'next / previous link'],
  ['gg / G', 'first / last link'],
  ['J / K', 'previous / next source panel'],
  ['[ / ]', 'move source earlier / later'],
  ['enter / f', 'open focused link'],
  ['yy', 'copy focused URL'],
  ['r / R', 'poll focused / all sources'],
  ['/ or cmd+k', 'open source catalog'],
  ['?', 'toggle this help'],
]

export function ShortcutHelp({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  if (!open) return null

  return (
    <div className="shortcut-overlay" onClick={onClose}>
      <div
        className="shortcut-help"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-label="Reading shortcuts"
      >
        <div className="shortcut-help-head">
          <span>reading shortcuts</span>
          <button onClick={onClose}>×</button>
        </div>
        {SHORTCUTS.map(([keys, action]) => (
          <div className="shortcut-row" key={keys}>
            <kbd>{keys}</kbd>
            <span>{action}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
