// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GitBranchChangeEntry } from '../../../../../../shared/git-diff-compare-types'
import { GitHistoryCommitFiles } from './git-history-commit-files'

const entries: GitBranchChangeEntry[] = [
  { path: 'src/main/resources/sql/get/Query.sql', status: 'modified' },
  { path: 'src/main/java/app/service/QueryService.java', status: 'modified' },
  { path: 'README.md', status: 'added' }
]

function shownPaths(): (string | null)[] {
  return screen
    .getAllByTestId('git-history-commit-file')
    .map((row) => row.getAttribute('data-commit-file-path'))
}

afterEach(cleanup)

describe('GitHistoryCommitFiles tree layout', () => {
  it('groups files under compacted folders and collapses them', () => {
    render(
      <GitHistoryCommitFiles
        layout="tree"
        state={{ status: 'ready', entries }}
        onOpenFile={vi.fn()}
      />
    )
    expect(screen.getByText('src/main')).toBeTruthy()
    expect(screen.getByText('java/app/service')).toBeTruthy()
    expect(screen.getByText('resources/sql/get')).toBeTruthy()
    // Folders first, then root files; the path hint is gone because the folders carry it.
    expect(shownPaths()).toEqual([
      'src/main/java/app/service/QueryService.java',
      'src/main/resources/sql/get/Query.sql',
      'README.md'
    ])
    expect(screen.queryByText('src/main/java/app/service')).toBeNull()

    fireEvent.click(screen.getByText('src/main'))
    expect(shownPaths()).toEqual(['README.md'])
  })

  it('hands the menu the files in tree order so shift ranges follow the rows', () => {
    const renderFilesMenu = vi.fn((_entries: readonly GitBranchChangeEntry[]) => <div />)
    render(
      <GitHistoryCommitFiles
        layout="tree"
        state={{ status: 'ready', entries }}
        onOpenFile={vi.fn()}
        renderFilesMenu={(menuEntries, _open, renderList) => {
          renderFilesMenu(menuEntries)
          return renderList(new Set())
        }}
      />
    )
    expect(renderFilesMenu.mock.lastCall?.[0].map((entry) => entry.path)).toEqual([
      'src/main/java/app/service/QueryService.java',
      'src/main/resources/sql/get/Query.sql',
      'README.md'
    ])
  })
})
