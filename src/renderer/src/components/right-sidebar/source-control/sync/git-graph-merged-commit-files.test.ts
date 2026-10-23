import { describe, expect, it } from 'vitest'
import type { GitHistoryItem } from '../../../../../../shared/git-history'
import { mergeCommitFiles } from './git-graph-merged-commit-files'

function commit(id: string): GitHistoryItem {
  return { id, displayId: id.slice(0, 7), parentIds: [], subject: id, message: id }
}

describe('mergeCommitFiles', () => {
  const newest = commit('c'.repeat(40))
  const middle = commit('b'.repeat(40))
  const oldest = commit('a'.repeat(40))

  it('follows a rename back to the oldest selected change of the original path', () => {
    const merged = mergeCommitFiles([newest, middle, oldest], {
      [newest.id]: {
        status: 'ready',
        entries: [{ path: 'new.ts', status: 'renamed', oldPath: 'mid.ts' }]
      },
      [middle.id]: {
        status: 'ready',
        entries: [{ path: 'mid.ts', status: 'renamed', oldPath: 'old.ts' }]
      },
      [oldest.id]: { status: 'ready', entries: [{ path: 'old.ts', status: 'modified' }] }
    })

    expect(merged.state).toEqual({
      status: 'ready',
      entries: [{ path: 'new.ts', status: 'renamed', oldPath: 'old.ts' }]
    })
    expect(merged.targetByPath.get('new.ts')).toMatchObject({ head: newest, base: oldest })
  })

  it('does not let a reused path pull an unrelated older deletion into a rename chain', () => {
    // oldest: delete b; then rename a -> b; newest: rename b -> c
    const merged = mergeCommitFiles([newest, middle, oldest], {
      [newest.id]: { status: 'ready', entries: [{ path: 'c', status: 'renamed', oldPath: 'b' }] },
      [middle.id]: { status: 'ready', entries: [{ path: 'b', status: 'renamed', oldPath: 'a' }] },
      [oldest.id]: { status: 'ready', entries: [{ path: 'b', status: 'deleted' }] }
    })

    expect(merged.targetByPath.get('c')).toEqual({
      entry: { path: 'c', status: 'renamed', oldPath: 'a' },
      head: newest,
      base: middle
    })
    expect(merged.targetByPath.get('b')).toEqual({
      entry: { path: 'b', status: 'deleted' },
      head: oldest,
      base: oldest
    })
  })

  it('keeps a copied source as its own row, even when the same commit edits it', () => {
    const merged = mergeCommitFiles([newest, oldest], {
      [newest.id]: {
        status: 'ready',
        entries: [
          { path: 'a.ts', status: 'copied', oldPath: 'z.ts' },
          { path: 'z.ts', status: 'modified' }
        ]
      },
      [oldest.id]: { status: 'ready', entries: [{ path: 'z.ts', status: 'modified' }] }
    })

    expect(merged.state).toMatchObject({
      entries: [
        { path: 'a.ts', status: 'copied', oldPath: 'z.ts' },
        { path: 'z.ts', status: 'modified' }
      ]
    })
    expect(merged.targetByPath.get('z.ts')).toMatchObject({ head: newest, base: oldest })
    expect(merged.targetByPath.get('a.ts')).toMatchObject({ head: newest, base: newest })
  })

  it('keeps a copied-then-modified path a copy, and a copied-then-deleted path empty on both sides', () => {
    const merged = mergeCommitFiles([newest, oldest], {
      [newest.id]: {
        status: 'ready',
        entries: [
          { path: 'a.ts', status: 'modified' },
          { path: 'b.ts', status: 'deleted' }
        ]
      },
      [oldest.id]: {
        status: 'ready',
        entries: [
          { path: 'a.ts', status: 'copied', oldPath: 'z.ts' },
          { path: 'b.ts', status: 'copied', oldPath: 'z.ts' }
        ]
      }
    })

    expect(merged.targetByPath.get('a.ts')?.entry).toEqual({
      path: 'a.ts',
      status: 'copied',
      oldPath: 'z.ts'
    })
    expect(merged.targetByPath.get('b.ts')?.entry).toEqual({ path: 'b.ts', status: 'deleted' })
  })

  it('spans an added-then-modified path from before it existed', () => {
    const merged = mergeCommitFiles([newest, oldest], {
      [newest.id]: { status: 'ready', entries: [{ path: 'a.ts', status: 'modified', added: 1 }] },
      [oldest.id]: { status: 'ready', entries: [{ path: 'a.ts', status: 'added', added: 9 }] }
    })

    expect(merged.targetByPath.get('a.ts')).toEqual({
      entry: { path: 'a.ts', status: 'added' },
      head: newest,
      base: oldest
    })
  })
})
