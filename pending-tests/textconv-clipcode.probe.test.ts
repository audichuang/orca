import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { getDiff } from './file-diff'
import { getCommitDiff } from './commit-diff'
import { buildClipcodeGitCopy } from '../../../renderer/src/components/right-sidebar/source-control/clipcode/clipcode-git-copy'
import { buildClipcodeCommitCopy } from '../../../renderer/src/components/right-sidebar/source-control/clipcode/clipcode-commit-copy'

it('copies stored source rather than textconv output from staged rows and commits', async () => {
  const repo = mkdtempSync(join(tmpdir(), 'orca-rebase-textconv-'))
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim()
  try {
    git('init', '-q')
    git('config', 'user.email', 'review@example.com')
    git('config', 'user.name', 'Review')
    git('config', 'diff.review.textconv', "sed 's/^/DISPLAY:/'")
    writeFileSync(join(repo, '.gitattributes'), '*.dat diff=review\n')
    writeFileSync(join(repo, 'file.dat'), 'old source\n')
    git('add', '.')
    git('commit', '-qm', 'base')
    const parentOid = git('rev-parse', 'HEAD')
    writeFileSync(join(repo, 'file.dat'), 'new source\n')
    git('add', '.')
    const stagedDiff = await getDiff(repo, 'file.dat', true, false, { skipRenderLimit: true })
    const context = { worktreeId: 'repo', worktreePath: repo, executionHostId: 'local' }
    const staged = await buildClipcodeGitCopy({
      rootPath: repo,
      repos: [{ context, entries: [{ path: 'file.dat', area: 'staged', status: 'modified' }], forceIndexForStaged: true }],
      readers: { readDiff: async () => stagedDiff, readWorkingFile: async () => { throw new Error('unused') } }
    })
    git('commit', '-qm', 'next')
    const commitOid = git('rev-parse', 'HEAD')
    const commitDiff = await getCommitDiff(repo, { commitOid, parentOid, filePath: 'file.dat' })
    const committed = await buildClipcodeCommitCopy({
      rootPath: repo, context,
      commits: [{ commitOid, parentOids: [parentOid], entries: [{ path: 'file.dat', status: 'modified' }] }],
      readers: { readCommitDiff: async () => commitDiff }
    })
    console.log(JSON.stringify({ raw: git('show', ':file.dat'), stagedDiff, stagedPayload: staged.payload, commitDiff, commitPayload: committed.payload }))
    expect.soft(staged.payload).not.toContain('DISPLAY:')
    expect.soft(committed.payload).not.toContain('DISPLAY:')
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})
