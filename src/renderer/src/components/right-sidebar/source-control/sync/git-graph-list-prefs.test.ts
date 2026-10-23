// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

const KEY = 'orca:git-graph-list'

// Why a fresh module per case: the store caches its first read, as a new window would not.
async function prefsAfterRestart(): Promise<unknown> {
  vi.resetModules()
  const { useGitGraphListPrefs } = await import('./git-graph-list-prefs')
  return renderHook(() => useGitGraphListPrefs()).result.current
}

afterEach(() => {
  window.localStorage.removeItem(KEY)
})

describe('Git Graph list prefs across restarts', () => {
  it('restores every saved choice in a new window', async () => {
    vi.resetModules()
    const { setGitGraphListPrefs } = await import('./git-graph-list-prefs')
    setGitGraphListPrefs({ author: false, date: false, hash: true, twoLine: true })
    expect(await prefsAfterRestart()).toEqual({
      author: false,
      date: false,
      hash: true,
      twoLine: true
    })
  })

  it('falls back to the defaults for unreadable storage', async () => {
    window.localStorage.setItem(KEY, '{not json')
    expect(await prefsAfterRestart()).toEqual({
      author: true,
      date: true,
      hash: false,
      twoLine: false
    })
  })

  it('keeps the valid fields of a partial or mistyped save', async () => {
    window.localStorage.setItem(KEY, JSON.stringify({ hash: true, twoLine: 'yes' }))
    expect(await prefsAfterRestart()).toEqual({
      author: true,
      date: true,
      hash: true,
      twoLine: false
    })
  })
})
