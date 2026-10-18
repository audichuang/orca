// Fork seam guard: the graph walk must pass every `git log` option upstream's loader passes,
// because both feed upstream's parser; a new upstream flag the format relies on would otherwise be missed.
import { describe, expect, it } from 'vitest'
import { loadGitHistoryFromExecutor } from './git-history'
import { loadGitHistoryGraphFromExecutor } from './git-history-graph-query'
import type { GitHistoryExecutor } from './git-history-types'

const HEAD = 'a'.repeat(40)

function recordingGit(): { git: GitHistoryExecutor; logCalls: string[][] } {
  const logCalls: string[][] = []
  const git: GitHistoryExecutor = async (args) => {
    if (args[0] === 'log') {
      logCalls.push(args)
      return { stdout: '' }
    }
    if (args[0] === 'rev-parse') {
      return { stdout: `${HEAD}\n` }
    }
    return { stdout: '' }
  }
  return { git, logCalls }
}

/** Options only: drop the page size, revisions and anything after `--end-of-options` / `--`. */
function logOptions(args: string[]): string[] {
  const end = args.findIndex((arg) => arg === '--end-of-options' || arg === '--')
  return (end === -1 ? args : args.slice(0, end))
    .slice(1)
    .filter(
      (arg) => arg.startsWith('-') && !/^-n\d+$/.test(arg) && !/^--(branches|remotes)/.test(arg)
    )
}

describe('graph git log argv parity with upstream', () => {
  it('passes every option upstream passes', async () => {
    const upstream = recordingGit()
    await loadGitHistoryFromExecutor(upstream.git, '/repo', { limit: 10 })
    const fork = recordingGit()
    await loadGitHistoryGraphFromExecutor(fork.git, '/repo', {
      limit: 10,
      graph: { mode: 'all', source: { local: true, remotes: [] } }
    })
    const upstreamOptions = logOptions(upstream.logCalls.at(-1) ?? [])
    const forkOptions = logOptions(fork.logCalls.at(-1) ?? [])
    expect(upstreamOptions.length).toBeGreaterThan(0)
    expect(forkOptions).toEqual(expect.arrayContaining(upstreamOptions))
  })
})
