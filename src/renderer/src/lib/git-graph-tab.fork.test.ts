import { beforeEach, describe, expect, it, vi } from 'vitest'

const openGitGraphTab = vi.fn((_worktreeId: string) => true)
const openFile = vi.fn()

vi.mock('@/store', () => ({
  useAppStore: { getState: () => ({ openGitGraphTab, openFile, openFiles: [] }) }
}))

import { openGitGraph } from './git-graph-tab'

describe("upstream's openGitGraph entry point", () => {
  beforeEach(() => {
    openGitGraphTab.mockClear()
    openFile.mockClear()
  })

  it("opens the fork's Git Graph tab instead of upstream's", async () => {
    await openGitGraph('repo-1::/work/app', () => 'group-2')

    expect(openGitGraphTab).toHaveBeenCalledWith('repo-1::/work/app')
    expect(openFile).not.toHaveBeenCalled()
  })
})
