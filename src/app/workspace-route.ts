export type Workspace = 'health' | 'reading'

export function workspaceFromUrl(pathname: string, search: string): Workspace {
  if (
    pathname === '/r' ||
    new URLSearchParams(search).get('workspace') === 'reading'
  )
    return 'reading'
  return 'health'
}

export function workspacePath(workspace: Workspace): '/' | '/r' {
  return workspace === 'reading' ? '/r' : '/'
}
