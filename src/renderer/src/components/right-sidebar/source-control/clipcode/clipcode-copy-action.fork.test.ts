import { beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from '@/store'
import { getClipcodeRootPath } from './clipcode-copy-action'

function setFolder(folderPath: string, executionHostId?: string): void {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the resolver reads only id, folderPath and the owner fields.
  useAppStore.setState({ folderWorkspaces: [{ id: 'f1', folderPath, executionHostId }] } as never)
}

const LOCAL_OWNER = { executionHostId: 'local' } as const
const HOST_B = { executionHostId: 'runtime:hostB' } as const

describe('getClipcodeRootPath in a folder workspace', () => {
  beforeEach(() => setFolder('/work'))

  it('roots at the folder when the folder contains the repo', () => {
    expect(getClipcodeRootPath('folder:f1', '/work/repo', LOCAL_OWNER)).toBe('/work')
  })

  it('roots at the folder when the repo contains the folder so a restore in that folder round-trips', () => {
    setFolder('/work/repo/packages/app')
    expect(getClipcodeRootPath('folder:f1', '/work/repo', LOCAL_OWNER)).toBe(
      '/work/repo/packages/app'
    )
  })

  it('roots at the worktree when a lineage-attached repo lies outside the folder', () => {
    expect(getClipcodeRootPath('folder:f1', '/other/repo', LOCAL_OWNER)).toBe('/other/repo')
  })

  it('roots at the worktree when the folder inside the repo path is on another host', () => {
    setFolder('/work/repo/app', 'runtime:hostA')
    expect(getClipcodeRootPath('folder:f1', '/work/repo', HOST_B)).toBe('/work/repo')
  })

  it('roots at the worktree when the folder containing the repo path is on another host', () => {
    setFolder('/work', 'runtime:hostA')
    expect(getClipcodeRootPath('folder:f1', '/work/repo', HOST_B)).toBe('/work/repo')
  })
})
