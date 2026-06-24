import { describe, expect, it } from 'vitest'
import type { GitStatusEntry } from '../../../../shared/git-status-types'
import { findAdjacentChangedFilePath, findAdjacentChangeLine } from './diff-change-navigation'

describe('findAdjacentChangeLine', () => {
  const lines = [5, 12, 30]

  it('finds the next change after the cursor', () => {
    expect(findAdjacentChangeLine(lines, 5, 'next')).toBe(12)
    expect(findAdjacentChangeLine(lines, 1, 'next')).toBe(5)
  })

  it('returns null past the last change (boundary)', () => {
    expect(findAdjacentChangeLine(lines, 30, 'next')).toBeNull()
    expect(findAdjacentChangeLine(lines, 99, 'next')).toBeNull()
  })

  it('finds the previous change before the cursor', () => {
    expect(findAdjacentChangeLine(lines, 30, 'previous')).toBe(12)
    expect(findAdjacentChangeLine(lines, 13, 'previous')).toBe(12)
  })

  it('returns null before the first change (boundary) and for empty input', () => {
    expect(findAdjacentChangeLine(lines, 5, 'previous')).toBeNull()
    expect(findAdjacentChangeLine([], 1, 'next')).toBeNull()
  })
})

describe('findAdjacentChangedFilePath', () => {
  // Entries given out of order to prove the helper sorts to the displayed order.
  const entries: GitStatusEntry[] = [
    { path: 'c.ts', status: 'modified', area: 'unstaged' },
    { path: 'b.ts', status: 'modified', area: 'staged' },
    { path: 'a.ts', status: 'modified', area: 'unstaged' },
    { path: 'd.txt', status: 'untracked', area: 'untracked' }
  ]
  // changes-first: unstaged group, then staged, then untracked.
  const order = ['unstaged', 'staged', 'untracked'] as const

  it('walks unstaged then untracked entries together, in displayed order', () => {
    expect(findAdjacentChangedFilePath(entries, 'a.ts', 'unstaged', 'next', order)).toBe('c.ts')
    expect(findAdjacentChangedFilePath(entries, 'c.ts', 'unstaged', 'next', order)).toBe('d.txt')
  })

  it('returns null at the list boundary', () => {
    expect(findAdjacentChangedFilePath(entries, 'd.txt', 'unstaged', 'next', order)).toBeNull()
    expect(findAdjacentChangedFilePath(entries, 'a.ts', 'unstaged', 'previous', order)).toBeNull()
  })

  it('keeps staged files in their own list', () => {
    expect(findAdjacentChangedFilePath(entries, 'b.ts', 'staged', 'next', order)).toBeNull()
  })

  it('returns null for non-working-tree diff sources', () => {
    expect(findAdjacentChangedFilePath(entries, 'a.ts', 'branch', 'next', order)).toBeNull()
  })
})
