// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it } from 'vitest'
import {
  BRANCH,
  COMMIT,
  REPO,
  ROOT,
  folderFile,
  installFolderRuntime,
  seedFolderGitOwner
} from '../../folder-git-owner.test-fixture'
import { fetchCombinedDiffSection } from './fetch-combined-diff-section'

let runtime: ReturnType<typeof installFolderRuntime>
beforeEach(() => {
  seedFolderGitOwner()
  runtime = installFolderRuntime()
})
afterEach(() => runtime.restore())

it.each(['unstaged', 'branch', 'commit'] as const)(
  'reads a folder combined %s section from its repo on the server',
  async (mode) => {
    await fetchCombinedDiffSection({
      file: folderFile({ filePath: ROOT }),
      entry: { path: 'src/a.ts', status: 'modified', area: 'unstaged' },
      branchCompare: BRANCH,
      commitCompare: COMMIT,
      isAllMode: false,
      isBranchMode: mode === 'branch',
      isCommitMode: mode === 'commit'
    })
    expect(runtime.call).toHaveBeenCalledWith(
      expect.objectContaining({
        selector: 'server',
        method:
          mode === 'branch' ? 'git.branchDiff' : mode === 'commit' ? 'git.commitDiff' : 'git.diff',
        params: expect.objectContaining({ worktree: `id:${REPO}`, filePath: 'src/a.ts' })
      })
    )
  }
)
