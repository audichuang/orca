// @vitest-environment happy-dom
// Fork: "Show in Git Graph" in the sidebar Commits context menu.
import '@testing-library/jest-dom/vitest'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAppStore } from '@/store'
import type { GitHistoryItem } from '../../../../../../shared/git-history'
import { GitHistoryPanel } from './git-history-panel'
import { showCommitInGitGraphSlot } from '../../../git-graph-tab/git-graph-source-control-link'

const COMMIT: GitHistoryItem = {
  id: 'a'.repeat(40),
  parentIds: [],
  subject: 'Alpha',
  message: 'Alpha',
  timestamp: 1
}

function renderPanel(onShowCommitInGraph?: (item: GitHistoryItem) => void): void {
  render(
    <TooltipProvider>
      <GitHistoryPanel
        state={{
          status: 'ready',
          result: {
            items: [COMMIT],
            hasIncomingChanges: false,
            hasOutgoingChanges: false,
            hasMore: false,
            limit: 50
          }
        }}
        collapsed={false}
        onToggle={vi.fn()}
        onRefresh={vi.fn()}
        onCommitAction={vi.fn()}
        onShowCommitInGraph={onShowCommitInGraph}
      />
    </TooltipProvider>
  )
}

afterEach(() => {
  cleanup()
  useAppStore.setState(useAppStore.getInitialState(), true)
})

describe('Show in Git Graph', () => {
  it('is offered only when the host wires it', async () => {
    renderPanel()
    fireEvent.contextMenu(screen.getByText('Alpha'))
    expect(await screen.findByRole('menuitem', { name: 'Copy commit hash' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Show in Git Graph' })).toBeNull()
  })

  it("opens the graph on the section's repo and reveals the commit", async () => {
    const openGitGraphTab = vi.fn(() => 'tab')
    useAppStore.setState({ openGitGraphTab })
    renderPanel(showCommitInGitGraphSlot('folder:f1', 'wt-web'))
    fireEvent.contextMenu(screen.getByText('Alpha'))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Show in Git Graph' }))
    expect(openGitGraphTab).toHaveBeenCalledWith('folder:f1', {
      repoWorktreeId: 'wt-web',
      revealCommit: COMMIT.id
    })
  })
})
