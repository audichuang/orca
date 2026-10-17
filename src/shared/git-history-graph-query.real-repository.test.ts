import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runProcess } from '@orca/process-host'
import { resolveExecutableCommand } from './node-cli-command-resolution'
import { loadGitHistoryGraphFromExecutor } from './git-history-graph-query'
import type { GitHistoryExecutor } from './git-history-types'

const repositories: string[] = []
const gitBinary = resolveExecutableCommand(process.env.ORCA_TEST_GIT_BINARY ?? 'git')

afterEach(async () => {
  await Promise.all(
    repositories.splice(0).map((repo) => rm(repo, { recursive: true, force: true }))
  )
})

async function createRepository() {
  if (!gitBinary) {
    throw new Error('Git is required for the real graph history test')
  }
  const repo = await mkdtemp(join(tmpdir(), 'orca-history-graph-'))
  repositories.push(repo)
  const emptyConfig = join(repo, 'empty-git-config')
  const emptyHooks = join(repo, 'empty-hooks')
  await writeFile(emptyConfig, '')
  await mkdir(emptyHooks)
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_'))
  )
  let tick = 0
  const git: GitHistoryExecutor = async (args, cwd = repo) => {
    tick += 1
    const date = `2000-01-01T00:${String(tick).padStart(2, '0')}:00Z`
    const result = await runProcess({
      program: gitBinary,
      args,
      cwd,
      env: {
        ...env,
        LC_ALL: 'C',
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: emptyConfig,
        GIT_AUTHOR_DATE: date,
        GIT_COMMITTER_DATE: date
      },
      timeoutMs: 10000,
      maxOutputBytes: 1024 * 1024
    })
    if (result.code !== 0 || result.timedOut || result.outputTruncated) {
      throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`)
    }
    return { stdout: result.stdout }
  }
  const commit = async (message: string, file?: string, author?: string) => {
    if (file) {
      await writeFile(join(repo, file), `${message}\n`)
      await git(['add', file], repo)
    }
    await git(
      [
        ...(author ? ['-c', `user.name=${author}`] : []),
        'commit',
        '--quiet',
        '--allow-empty',
        '-m',
        message
      ],
      repo
    )
  }
  await git(['init', '--quiet'], repo)
  await git(['config', 'user.name', 'Graph Fixture'], repo)
  await git(['config', 'user.email', 'graph-fixture@example.test'], repo)
  await git(['config', 'commit.gpgsign', 'false'], repo)
  await git(['config', 'core.hooksPath', emptyHooks], repo)
  await git(['checkout', '-b', 'main'], repo)
  await commit('root', 'readme.md')
  await commit('main work', 'main.txt')
  await git(['checkout', '-b', 'feature'], repo)
  await commit('feature work', 'feature.txt', 'Feature Author')
  await git(['checkout', 'main'], repo)
  // Remote-only commits: create them on throwaway branches, then move them under refs/remotes.
  for (const [remote, branch, message] of [
    ['origin', 'main', 'origin only'],
    ['upstream', 'dev', 'upstream only']
  ] as const) {
    await git(['remote', 'add', remote, join(repo, `missing-${remote}`)], repo)
    await git(['checkout', '--quiet', '-b', `tmp-${remote}`], repo)
    await commit(message, `${remote}.txt`)
    const { stdout } = await git(['rev-parse', 'HEAD'], repo)
    await git(['update-ref', `refs/remotes/${remote}/${branch}`, stdout.trim()], repo)
    await git(['checkout', '--quiet', 'main'], repo)
    await git(['branch', '--quiet', '-D', `tmp-${remote}`], repo)
  }
  await git(['symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main'], repo)
  return { repo, git }
}

const subjects = (items: { subject: string }[]): string[] => items.map((item) => item.subject)

describe('loadGitHistoryGraphFromExecutor on a real repository', () => {
  it('lists every local branch but no remote-only commit when only local sources are on', async () => {
    const { repo, git } = await createRepository()
    const result = await loadGitHistoryGraphFromExecutor(git, repo, {
      graph: { mode: 'all', source: { local: true, remotes: [] } }
    })
    expect(subjects(result.items).sort()).toEqual(['feature work', 'main work', 'root'])
    expect(result.graph?.mode).toBe('all')
  })

  it('adds only the chosen remote', async () => {
    const { repo, git } = await createRepository()
    const result = await loadGitHistoryGraphFromExecutor(git, repo, {
      graph: { mode: 'all', source: { local: false, remotes: ['origin'] } }
    })
    expect(subjects(result.items)).toContain('origin only')
    expect(subjects(result.items)).not.toContain('upstream only')
    expect(subjects(result.items)).not.toContain('feature work')
  })

  it('walks only the selected branches', async () => {
    const { repo, git } = await createRepository()
    const result = await loadGitHistoryGraphFromExecutor(git, repo, {
      graph: { mode: 'refs', refs: ['refs/heads/feature', 'refs/remotes/upstream/dev'] }
    })
    expect(subjects(result.items).sort()).toEqual([
      'feature work',
      'main work',
      'root',
      'upstream only'
    ])
  })

  it('ignores refs that would act as options or reach outside branches', async () => {
    const { repo, git } = await createRepository()
    const result = await loadGitHistoryGraphFromExecutor(git, repo, {
      graph: { mode: 'refs', refs: ['--all', '-n1', 'HEAD~1', 'refs/tags/x', 'refs/heads/feature'] }
    })
    expect(subjects(result.items).sort()).toEqual(['feature work', 'main work', 'root'])
  })

  it('searches message, author and path together on the git side', async () => {
    const { repo, git } = await createRepository()
    const byText = await loadGitHistoryGraphFromExecutor(git, repo, {
      graph: { mode: 'all', source: { local: true, remotes: 'all' }, search: { text: 'ONLY' } }
    })
    expect(subjects(byText.items).sort()).toEqual(['origin only', 'upstream only'])

    const byAuthorAndText = await loadGitHistoryGraphFromExecutor(git, repo, {
      graph: {
        mode: 'all',
        source: { local: true, remotes: 'all' },
        search: { text: 'work', author: 'feature author' }
      }
    })
    expect(subjects(byAuthorAndText.items)).toEqual(['feature work'])

    const byPath = await loadGitHistoryGraphFromExecutor(git, repo, {
      graph: { mode: 'all', source: { local: true, remotes: [] }, search: { path: 'main.txt' } }
    })
    expect(subjects(byPath.items)).toEqual(['main work'])
  })

  it('reports branch options and remotes for the filter, without symbolic remote HEADs', async () => {
    const { repo, git } = await createRepository()
    const result = await loadGitHistoryGraphFromExecutor(git, repo, {
      graph: { mode: 'head' }
    })
    expect(result.graph?.remotes).toEqual(['origin', 'upstream'])
    const options = result.graph?.refs.map((ref) => [ref.fullName, ref.category, ref.remote])
    expect(options).toEqual(
      expect.arrayContaining([
        ['refs/heads/main', 'branches', undefined],
        ['refs/heads/feature', 'branches', undefined],
        ['refs/remotes/origin/main', 'remote branches', 'origin'],
        ['refs/remotes/upstream/dev', 'remote branches', 'upstream']
      ])
    )
    expect(result.graph?.refs.some((ref) => ref.fullName === 'refs/remotes/origin/HEAD')).toBe(
      false
    )
    expect(subjects(result.items)).toEqual(['main work', 'root'])
  })

  it('honours the graph limit and reports more', async () => {
    const { repo, git } = await createRepository()
    const first = await loadGitHistoryGraphFromExecutor(git, repo, {
      graph: { mode: 'all', source: { local: true, remotes: 'all' }, limit: 2 }
    })
    expect(first.items).toHaveLength(2)
    expect(first.hasMore).toBe(true)
    expect(first.graph?.limit).toBe(2)
  })
})
