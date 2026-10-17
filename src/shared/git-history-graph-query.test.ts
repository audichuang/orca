import { describe, expect, it } from 'vitest'
import { buildGitHistoryGraphLogRevisions } from './git-history-graph-query'

describe('buildGitHistoryGraphLogRevisions', () => {
  it('never asks git for --all, even with every source on', () => {
    const args = buildGitHistoryGraphLogRevisions(
      { mode: 'all', source: { local: true, remotes: 'all' } },
      ['origin', 'upstream']
    )
    expect(args).not.toContain('--all')
    expect(args).toEqual([
      '--branches',
      '--remotes=origin',
      '--remotes=upstream',
      '--end-of-options',
      'HEAD'
    ])
  })

  it('drops remote names that would widen the glob', () => {
    const args = buildGitHistoryGraphLogRevisions(
      { mode: 'all', source: { local: false, remotes: ['origin', '*', 'a?b', '-x', 'up stream'] } },
      ['origin', '*', 'a?b', '-x', 'up stream']
    )
    expect(args).toEqual(['--remotes=origin'])
  })

  it('walks nothing when every source is off', () => {
    expect(
      buildGitHistoryGraphLogRevisions({ mode: 'all', source: { local: false, remotes: [] } }, [
        'origin'
      ])
    ).toEqual([])
  })

  it('keeps only branch refs in refs mode', () => {
    const args = buildGitHistoryGraphLogRevisions(
      {
        mode: 'refs',
        refs: ['refs/heads/a', 'refs/remotes/o/b', 'refs/tags/t', '--all', 'refs/heads/-x']
      },
      []
    )
    expect(args).toEqual(['--end-of-options', 'refs/heads/a', 'refs/remotes/o/b'])
  })
})
