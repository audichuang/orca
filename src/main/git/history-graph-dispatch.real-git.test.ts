// Fork seam guard: main's getHistory must route `graph` to the fork's multi-branch walk on a real repo.
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runProcess } from '@orca/process-host'
import { resolveExecutableCommand } from '../../shared/node-cli-command-resolution'
import { getHistory } from './history'

const repos: string[] = []
const gitBinary = resolveExecutableCommand(process.env.ORCA_TEST_GIT_BINARY ?? 'git')

afterEach(async () => {
  await Promise.all(repos.splice(0).map((repo) => rm(repo, { recursive: true, force: true })))
})

async function repoWithSideBranch(): Promise<string> {
  if (!gitBinary) {
    throw new Error('Git is required')
  }
  const repo = await mkdtemp(join(tmpdir(), 'orca-history-dispatch-'))
  repos.push(repo)
  const hooks = join(repo, 'no-hooks')
  await mkdir(hooks)
  const git = async (...args: string[]) => {
    const r = await runProcess({
      program: gitBinary,
      args: [
        '-c',
        'user.name=F',
        '-c',
        'user.email=f@example.test',
        '-c',
        'commit.gpgsign=false',
        '-c',
        `core.hooksPath=${hooks}`,
        ...args
      ],
      cwd: repo,
      env: { ...process.env, LC_ALL: 'C', GIT_CONFIG_NOSYSTEM: '1' },
      timeoutMs: 10_000,
      maxOutputBytes: 1024 * 1024
    })
    if (r.code !== 0) {
      throw new Error(`git ${args.join(' ')}: ${r.stderr}`)
    }
  }
  await git('init', '--quiet', '-b', 'main')
  await writeFile(join(repo, 'a.txt'), 'a\n')
  await git('add', 'a.txt')
  await git('commit', '--quiet', '-m', 'root')
  await git('checkout', '--quiet', '-b', 'side')
  await git('commit', '--quiet', '--allow-empty', '-m', 'side only')
  await git('checkout', '--quiet', 'main')
  await git('commit', '--quiet', '--allow-empty', '-m', 'main only')
  return repo
}

describe('getHistory graph dispatch (fork)', () => {
  it('walks every local branch and echoes `graph` only when the request carries it', async () => {
    const repo = await repoWithSideBranch()

    const plain = await getHistory(repo, { limit: 50 })
    expect(plain.graph).toBeUndefined()
    expect(plain.items.map((item) => item.subject)).toEqual(['main only', 'root'])

    const all = await getHistory(repo, {
      limit: 50,
      graph: { mode: 'all', source: { local: true, remotes: [] } }
    })
    expect(all.graph?.mode).toBe('all')
    expect(all.graph?.refs.map((ref) => ref.name).sort()).toEqual(['main', 'side'])
    expect(all.items.map((item) => item.subject).sort()).toEqual(['main only', 'root', 'side only'])
    // Parser contract: the fork reuses upstream's format + parser with its own argv.
    expect(all.items.every((item) => /^[0-9a-f]{40}$/.test(item.id) && item.author === 'F')).toBe(
      true
    )
    expect(all.items.every((item) => Number.isFinite(item.timestamp))).toBe(true)
    expect(all.items.map((item) => item.message).sort()).toEqual(['main only', 'root', 'side only'])
    expect(
      all.items.find((item) => item.subject === 'side only')?.references?.map((r) => r.name)
    ).toContain('side')
  })
})
