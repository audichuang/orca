import { describe, expect, it } from 'vitest'
import {
  newlyReadyEnvironmentIds,
  readyRuntimeEnvironmentIds
} from './online-runtime-environment-delta'
import type { RuntimeEnvironmentStatus } from '../../store/slices/runtime-status'

const withGraph = (graphStatus: string): RuntimeEnvironmentStatus =>
  ({ status: { graphStatus } as never, checkedAt: 0 }) as RuntimeEnvironmentStatus
const probeFailed = (): RuntimeEnvironmentStatus => ({ status: null, checkedAt: 0 })

describe('readyRuntimeEnvironmentIds', () => {
  it('returns only graph-ready env ids, sorted', () => {
    const map = new Map<string, RuntimeEnvironmentStatus>([
      ['b', withGraph('ready')],
      ['a', withGraph('ready')],
      ['c', withGraph('reloading')],
      ['d', probeFailed()],
      ['e', withGraph('unavailable')]
    ])
    expect(readyRuntimeEnvironmentIds(map)).toEqual(['a', 'b'])
  })

  it('tolerates a null/undefined map', () => {
    expect(readyRuntimeEnvironmentIds(null)).toEqual([])
    expect(readyRuntimeEnvironmentIds(undefined)).toEqual([])
  })
})

describe('newlyReadyEnvironmentIds', () => {
  it('returns [] on first run (null previous)', () => {
    expect(newlyReadyEnvironmentIds(null, ['a', 'b'])).toEqual([])
  })

  it('returns ids that newly became ready', () => {
    expect(newlyReadyEnvironmentIds(['a'], ['a', 'b'])).toEqual(['b'])
  })

  it('ignores hosts that left the ready set', () => {
    expect(newlyReadyEnvironmentIds(['a', 'b'], ['a'])).toEqual([])
  })

  it('returns all newly-ready when several appear at once', () => {
    expect(newlyReadyEnvironmentIds([], ['a', 'b'])).toEqual(['a', 'b'])
  })

  it('handles simultaneous add and remove', () => {
    expect(newlyReadyEnvironmentIds(['a'], ['b', 'c'])).toEqual(['b', 'c'])
  })
})
