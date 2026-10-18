import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runProcess } from '@orca/process-host'
import { getCommitDiff } from './commit-diff'

// Fork contract: ClipCode commit copy (renderer clipcode-commit-copy.ts) reads `missingSides` to
// tell an absent file from an empty one and to fall back to a merge's other parents.
const repos: string[] = []
afterEach(async () => {
  await Promise.all(repos.splice(0).map((repo) => rm(repo, { recursive: true, force: true })))
})

async function fixture() {
  const repo = await mkdtemp(join(tmpdir(), 'orca-commit-diff-missing-'))
  repos.push(repo)
  const git = async (...args: string[]): Promise<string> => {
    const r = await runProcess({
      program: 'git',
      args: [
        '-c',
        'user.name=T',
        '-c',
        'user.email=t@example.test',
        '-c',
        'commit.gpgsign=false',
        ...args
      ],
      cwd: repo,
      env: { ...process.env, LC_ALL: 'C', GIT_CONFIG_NOSYSTEM: '1' },
      timeoutMs: 10000,
      maxOutputBytes: 1024 * 1024
    })
    if (r.code !== 0) {
      throw new Error(`git ${args.join(' ')}: ${r.stderr}`)
    }
    return r.stdout.trim()
  }
  await git('init', '--quiet', '-b', 'main')
  await writeFile(join(repo, 'keep.txt'), 'v1\n')
  await writeFile(join(repo, 'gone.txt'), 'gone before\n')
  await writeFile(join(repo, 'empty.txt'), '')
  await git('add', '.')
  await git('commit', '--quiet', '-m', 'one')
  await writeFile(join(repo, 'keep.txt'), 'v2\n')
  await git('rm', '--quiet', 'gone.txt')
  await git('commit', '--quiet', '-am', 'two')
  return { repo, head: await git('rev-parse', 'HEAD'), parent: await git('rev-parse', 'HEAD^') }
}

describe('getCommitDiff missing sides', () => {
  it('marks only the absent side of a deletion and keeps the old content', async () => {
    const { repo, head, parent } = await fixture()
    const diff = await getCommitDiff(repo, {
      commitOid: head,
      parentOid: parent,
      filePath: 'gone.txt'
    })
    expect(diff.missingSides).toEqual(['modified'])
    expect(diff.originalContent).toBe('gone before\n')
  })

  it('marks both sides for a path neither commit has', async () => {
    const { repo, head, parent } = await fixture()
    const diff = await getCommitDiff(repo, {
      commitOid: head,
      parentOid: parent,
      filePath: 'never.txt'
    })
    expect(diff.missingSides).toEqual(['original', 'modified'])
  })

  it('leaves an empty file that exists unmarked', async () => {
    const { repo, head, parent } = await fixture()
    const diff = await getCommitDiff(repo, {
      commitOid: head,
      parentOid: parent,
      filePath: 'empty.txt'
    })
    expect(diff.missingSides).toBeUndefined()
  })
})
