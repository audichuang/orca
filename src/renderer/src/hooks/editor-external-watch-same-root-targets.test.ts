import { describe, expect, it } from 'vitest'
import { selectSameHostWatchTargets } from './editor-external-watch-same-root-targets'

const target = (worktreeId: string, connectionId?: string) => ({
  worktreeId,
  worktreePath: '/repo',
  connectionId,
  runtimeEnvironmentId: null
})

describe('selectSameHostWatchTargets', () => {
  it('fans a batch out to every workspace on one host', () => {
    const local = [target('folder:a'), target('folder:b')]
    expect(selectSameHostWatchTargets(local)).toEqual(local)
  })

  it('keeps only the first match when hosts differ, since the batch names no host', () => {
    const mixed = [target('a', 'ssh-1'), target('b', 'ssh-2')]
    expect(selectSameHostWatchTargets(mixed)).toEqual([mixed[0]])
  })
})
