import { beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from '@/store'
import { getClipcodeRootPath } from './clipcode-copy-action'

describe('getClipcodeRootPath in a folder workspace', () => {
  beforeEach(() => {
    useAppStore.setState({
      folderWorkspaces: [{ id: 'f1', folderPath: '/work/folder' }]
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the resolver reads only id and folderPath.
    } as never)
  })

  it('roots at the folder for a worktree inside it', () => {
    expect(getClipcodeRootPath('folder:f1', '/work/folder/repo')).toBe('/work/folder')
  })

  it('roots at the worktree when a lineage-attached repo lies outside the folder', () => {
    expect(getClipcodeRootPath('folder:f1', '/elsewhere/repo')).toBe('/elsewhere/repo')
  })
})
