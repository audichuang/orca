// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { OpenFile } from '@/store/slices/editor'

vi.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({ attributes: {}, listeners: {}, setNodeRef: vi.fn() })
}))

import { TooltipProvider } from '@/components/ui/tooltip'
import EditorFileTab from './EditorFileTab'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('EditorFileTab with a Git Graph tab', () => {
  it('draws the Git Graph icon', async () => {
    const file: OpenFile = {
      id: 'git-graph:wt-1',
      filePath: 'git-graph:wt-1',
      relativePath: 'Git Graph',
      worktreeId: 'wt-1',
      language: 'plaintext',
      isDirty: false,
      mode: 'git-graph',
      gitGraph: { repoWorktreeId: 'wt-1' }
    }
    const noop = (): void => {}
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () =>
      root.render(
        <TooltipProvider>
          <EditorFileTab
            file={file}
            isActive
            isPinned={false}
            hasTabsToRight={false}
            hasTabsToLeft={false}
            tabCount={1}
            gitStatus={null}
            onActivate={noop}
            onClose={noop}
            onCloseOthers={noop}
            onCloseToRight={noop}
            onCloseToLeft={noop}
            onCloseAll={noop}
            onTogglePin={noop}
            dragData={{
              kind: 'tab',
              worktreeId: 'wt-1',
              groupId: 'group-1',
              unifiedTabId: file.id,
              visibleTabId: file.id,
              tabType: 'editor',
              label: file.relativePath,
              iconPath: file.filePath
            }}
          />
        </TooltipProvider>
      )
    )
    expect(container.querySelector('svg.lucide-git-graph')).not.toBeNull()
    act(() => root.unmount())
  })
})
