// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { ConfirmationDialogProvider } from '@/components/confirmation-dialog'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAppStore } from '@/store'
import { makeWorktree } from '../../../../store/slices/worktrees-slice-test-fixtures'
import { SourceControlPanel } from './panel'

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState(), true)
  useAppStore.setState({
    repos: [{ id: 'repo-1', path: '/repo', displayName: 'repo', badgeColor: '#000', addedAt: 0 }],
    worktreesByRepo: { 'repo-1': [makeWorktree({ id: 'wt-1', repoId: 'repo-1', path: '/repo' })] },
    activeWorktreeId: 'wt-1',
    gitStatusByWorktree: { 'wt-1': [{ path: 'a.ts', status: 'modified', area: 'unstaged' }] }
  })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function renderPanel(): void {
  render(
    <ConfirmationDialogProvider>
      <TooltipProvider>
        <SourceControlPanel />
      </TooltipProvider>
    </ConfirmationDialogProvider>
  )
}

describe('SourceControlPanel with a capped status listing', () => {
  it('offers Copy Full Source for a complete listing', () => {
    renderPanel()
    expect(screen.getByRole('button', { name: 'Copy Full Source' })).toBeInTheDocument()
  })

  it('hides Copy Full Source when the repository is too large to list every file', () => {
    vi.stubGlobal('api', { git: { findHugeFoldersToIgnore: async () => [] } })
    useAppStore.setState({ gitStatusHugeByWorktree: { 'wt-1': { limit: 1 } } })
    renderPanel()
    expect(screen.getByText('a.ts')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Copy Full Source' })).toBeNull()
  })
})
