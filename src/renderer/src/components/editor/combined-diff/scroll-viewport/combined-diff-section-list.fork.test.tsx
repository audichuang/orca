// @vitest-environment happy-dom
import { cleanup, render, waitFor } from '@testing-library/react'
import { Virtualizer } from '@tanstack/react-virtual'
import { afterEach, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { seedFolderDiffNote, renderedRepoNote } from '../../folder-diff-monaco.test-fixture'
import { DIFF, ROOT, folderFile } from '../../folder-git-owner.test-fixture'
import { CombinedDiffSectionList } from './combined-diff-section-list'
import type { DiffSection } from '../../diff-section-types'

afterEach(cleanup)
it('renders the repo review note inside a folder combined diff section', async () => {
  seedFolderDiffNote()
  const sections: DiffSection[] = [
    {
      key: 'src/a.ts',
      path: 'src/a.ts',
      status: 'modified',
      area: 'staged',
      originalContent: 'before',
      modifiedContent: 'after',
      collapsed: false,
      loading: false,
      dirty: false,
      diffResult: DIFF,
      largeDiffRenderLimit: null
    }
  ]
  const virtualizer = new Virtualizer<HTMLDivElement, Element>({
    count: 1,
    getScrollElement: () => null,
    estimateSize: () => 500,
    scrollToFn: () => {},
    observeElementRect: () => {},
    observeElementOffset: () => {},
    initialRect: { width: 800, height: 600 }
  })
  render(
    <TooltipProvider>
      <CombinedDiffSectionList
        activeGroupId={undefined}
        canOpenWorkspaceFileBrowserForPath={() => false}
        diffCommentsForWorktree={[]}
        file={folderFile({ filePath: ROOT })}
        handleSectionSaveRef={{ current: async () => {} }}
        isAllMode={false}
        isBranchMode={false}
        isCommitMode={false}
        isDark={false}
        loadSection={vi.fn()}
        loadDeferredSection={vi.fn()}
        markDirectScrollInput={vi.fn()}
        modifiedEditorsRef={{ current: new Map() }}
        onScrollbarPointerDown={vi.fn()}
        openSection={vi.fn()}
        openSectionPreview={vi.fn()}
        retrySection={vi.fn()}
        scrollThumb={{ visible: false, top: 0, height: 64 }}
        sectionHeights={{}}
        sections={sections}
        setScrollContainerRef={vi.fn()}
        setSectionHeights={vi.fn()}
        setSections={vi.fn()}
        settings={null}
        sideBySide
        skippedConflictNotice={null}
        toggleSection={vi.fn()}
        virtualizer={virtualizer}
      />
    </TooltipProvider>
  )
  await waitFor(() => expect(renderedRepoNote()).toContain('Review the repo change'), {
    timeout: 10000
  })
})
