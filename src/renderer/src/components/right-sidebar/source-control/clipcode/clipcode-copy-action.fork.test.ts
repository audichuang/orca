import { beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from '@/store'
import { getClipcodeRootPath } from './clipcode-copy-action'

describe('getClipcodeRootPath in a folder workspace', () => {
  beforeEach(() => {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the resolver reads only id and folderPath.
    useAppStore.setState({
      folderWorkspaces: [{ id: 'f1', folderPath: '/work/folder' }]
    } as never)
  })

  it('roots at the folder when the worktree contains the folder', () => {
    expect(getClipcodeRootPath('folder:f1', '/work')).toBe('/work/folder')
  })

  it('roots at the worktree when a lineage-attached repo lies outside the folder', () => {
    expect(getClipcodeRootPath('folder:f1', '/elsewhere/repo')).toBe('/elsewhere/repo')
  })
})
