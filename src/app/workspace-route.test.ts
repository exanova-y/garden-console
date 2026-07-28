import { describe, expect, it } from 'vitest'
import { workspaceFromUrl, workspacePath } from './workspace-route'

describe('workspace routes', () => {
  it('keeps the reader on /r across reloads', () => {
    expect(workspaceFromUrl('/r', '')).toBe('reading')
    expect(workspacePath('reading')).toBe('/r')
  })

  it('supports the old reading query while it is redirected', () => {
    expect(workspaceFromUrl('/', '?workspace=reading')).toBe('reading')
  })

  it('uses the root path for health', () => {
    expect(workspaceFromUrl('/', '')).toBe('health')
    expect(workspacePath('health')).toBe('/')
  })
})
