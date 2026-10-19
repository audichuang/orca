// @vitest-environment happy-dom
import type React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { GitHistoryItem } from '../../../../../../shared/git-history'
import type { GitBranchChangeEntry } from '../../../../../../shared/git-diff-compare-types'

type MenuProps = {
  relativePath?: string
  absolutePath?: string
  onCopyFullSource?: () => void
  children: React.ReactNode
}
const menu = vi.hoisted((): { props: MenuProps | null } => ({ props: null }))
vi.mock('../listing/entry-context-menu', () => ({
  SourceControlEntryContextMenu: (props: MenuProps) => {
    menu.props = props
    return props.children
  }
}))

const { GitHistoryCommitFilesMenu } = await import('./git-history-commit-files-menu')

const item: GitHistoryItem = { id: 'a'.repeat(40), parentIds: [], subject: 's', message: 's' }
const entries: GitBranchChangeEntry[] = [
  { path: 'src/one.ts', status: 'modified' },
  { path: 'src/two.ts', status: 'added' }
]

describe('GitHistoryCommitFilesMenu', () => {
  it('targets the right-clicked file row', () => {
    const model = {
      activeConnectionId: null,
      openCommitFile: vi.fn(),
      copyCommitFileFullSource: vi.fn(),
      revealInExplorer: vi.fn()
    }
    render(
      <GitHistoryCommitFilesMenu
        model={model}
        worktreeId="wt-1"
        worktreePath="/repo"
        item={item}
        entries={entries}
      >
        <div>
          {entries.map((entry) => (
            <button key={entry.path} type="button" data-commit-file-path={entry.path}>
              <span>{entry.path}</span>
            </button>
          ))}
        </div>
      </GitHistoryCommitFilesMenu>
    )
    expect(menu.props?.relativePath).toBeUndefined()

    fireEvent.contextMenu(screen.getByText('src/two.ts'))

    expect(menu.props?.relativePath).toBe('src/two.ts')
    expect(menu.props?.absolutePath).toBe('/repo/src/two.ts')
    menu.props?.onCopyFullSource?.()
    expect(model.copyCommitFileFullSource).toHaveBeenCalledWith(item, entries[1])
  })
})
