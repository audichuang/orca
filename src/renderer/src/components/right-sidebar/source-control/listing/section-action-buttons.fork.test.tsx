// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { TooltipProvider } from '@/components/ui/tooltip'
import type { GitStatusEntry } from '../../../../../../shared/git-status-types'
import { SourceControlUncommittedSections } from './uncommitted-sections'
import {
  ClipcodeSourceControlActionsContext,
  type ClipcodeSourceControlActions
} from '../clipcode/clipcode-actions-context'
import type { SourceControlDisplaySection, SourceControlDisplaySectionId } from './section-order'

afterEach(cleanup)

function clipcodeActions(
  copySectionFullSource: ClipcodeSourceControlActions['copySectionFullSource'] | undefined,
  isStatusTruncated: boolean
): ClipcodeSourceControlActions | null {
  return copySectionFullSource
    ? {
        copyRowFullSource: vi.fn(),
        copySelectionFullSource: vi.fn(),
        copySectionFullSource,
        isStatusTruncated
      }
    : null
}

function renderUncommittedSections({
  sections = [
    {
      id: 'unstaged',
      area: 'unstaged',
      items: [{ path: 'src/app.ts', status: 'modified', area: 'unstaged' }]
    }
  ],
  isStatusTruncated = false,
  normalizedFilter = '',
  onCopySectionFullSource
}: {
  sections?: SourceControlDisplaySection[]
  isStatusTruncated?: boolean
  normalizedFilter?: string
  onCopySectionFullSource?: (
    entries: readonly GitStatusEntry[],
    area: GitStatusEntry['area']
  ) => void
} = {}): void {
  const unfilteredById = new Map<SourceControlDisplaySectionId, SourceControlDisplaySection>(
    sections.map((section) => [section.id, section])
  )
  const actions = clipcodeActions(onCopySectionFullSource, isStatusTruncated)
  render(
    <TooltipProvider>
      <ClipcodeSourceControlActionsContext.Provider value={actions}>
        <SourceControlUncommittedSections
          displaySections={sections}
          unfilteredDisplaySectionsById={unfilteredById}
          normalizedFilter={normalizedFilter}
          collapsedSections={new Set(sections.map((section) => section.id))}
          toggleSection={vi.fn()}
          onViewSection={vi.fn()}
          isExecutingBulk={false}
          requestDiscardAllInArea={vi.fn()}
          handleStageAllPaths={vi.fn()}
          handleStageSectionPaths={vi.fn()}
          handleUnstagePaths={vi.fn()}
          sourceControlViewMode="list"
          visibleTreeRowsBySection={{}}
          visibleListRowsBySection={{}}
          fileListScrollElement={null}
          collapsedTreeDirs={new Set()}
          toggleTreeDir={vi.fn()}
          requestDiscardPaths={vi.fn()}
          expandedSubmoduleKeys={new Set()}
          toggleSubmodule={vi.fn()}
          currentWorktreeId="worktree-1"
          worktreePath="/tmp/worktree-1"
          selectedKeySet={new Set()}
          activeOpenRowKeys={new Set()}
          handleSelect={vi.fn()}
          handleContextMenu={vi.fn()}
          revealInExplorer={vi.fn()}
          activeConnectionId={null}
          handleOpenDiff={vi.fn()}
          handleStage={vi.fn()}
          handleUnstage={vi.fn()}
          requestDiscardEntry={vi.fn()}
          diffCommentCountByPath={new Map()}
        />
      </ClipcodeSourceControlActionsContext.Provider>
    </TooltipProvider>
  )
}

describe('source control section header ClipCode actions', () => {
  it('copies the whole section through Copy Full Source, flagging the staged area', () => {
    const onCopySectionFullSource = vi.fn()
    const staged: SourceControlDisplaySection = {
      id: 'staged',
      area: 'staged',
      items: [{ path: 'a.ts', status: 'modified', area: 'staged' }]
    }
    renderUncommittedSections({ sections: [staged], onCopySectionFullSource })

    fireEvent.click(screen.getByRole('button', { name: 'Copy Full Source' }))

    expect(onCopySectionFullSource).toHaveBeenCalledWith(staged.items, 'staged')
  })

  it('hides Copy Full Source without the panel ClipCode actions, while filtering or capped', () => {
    renderUncommittedSections()
    expect(screen.queryByRole('button', { name: 'Copy Full Source' })).toBeNull()

    cleanup()
    renderUncommittedSections({ onCopySectionFullSource: vi.fn(), isStatusTruncated: true })
    expect(screen.queryByRole('button', { name: 'Copy Full Source' })).toBeNull()

    cleanup()
    renderUncommittedSections({ onCopySectionFullSource: vi.fn(), normalizedFilter: 'app' })
    expect(screen.queryByRole('button', { name: 'Copy Full Source' })).toBeNull()
  })
})
