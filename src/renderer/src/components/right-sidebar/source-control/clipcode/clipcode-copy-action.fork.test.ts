import { beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from '@/store'
import { getClipcodeRootPath } from './clipcode-copy-action'

function setFolder(folderPath: string): void {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the resolver reads only id and folderPath.
  useAppStore.setState({ folderWorkspaces: [{ id: 'f1', folderPath }] } as never)
}

describe('getClipcodeRootPath in a folder workspace', () => {
  beforeEach(() => setFolder('/work'))

  it('roots at the folder when the folder contains the repo', () => {
    expect(getClipcodeRootPath('folder:f1', '/work/repo')).toBe('/work')
  })

  it('roots at the folder when the repo contains the folder so a restore in that folder round-trips', () => {
    setFolder('/work/repo/packages/app')
    expect(getClipcodeRootPath('folder:f1', '/work/repo')).toBe('/work/repo/packages/app')
  })

  it('roots at the worktree when a lineage-attached repo lies outside the folder', () => {
    expect(getClipcodeRootPath('folder:f1', '/other/repo')).toBe('/other/repo')
  })
})
