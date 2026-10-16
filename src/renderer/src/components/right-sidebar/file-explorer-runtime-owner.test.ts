import { beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from '@/store'
import {
  getRightSidebarWorktreeOwnerSettings,
  getRightSidebarWorktreeRuntimeSettings
} from './file-explorer-runtime-owner'

describe('getRightSidebarWorktreeOwnerSettings', () => {
  beforeEach(() => {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: partial store slice; the resolver reads only these fields.
    useAppStore.setState({
      repos: [{ id: 'r1', connectionId: null }],
      worktreesByRepo: { r1: [{ id: 'r1::wt', repoId: 'r1' }] },
      runtimeEnvironments: [{ id: 'env-1' }],
      activeWorktreeId: null,
      settings: { activeRuntimeEnvironmentId: 'env-1' }
    } as never)
  })

  it('keeps an unstamped local repo local while a runtime is focused', () => {
    expect(getRightSidebarWorktreeOwnerSettings('r1::wt').activeRuntimeEnvironmentId).toBeNull()
  })

  it('differs from the focus-inheriting helper', () => {
    expect(getRightSidebarWorktreeRuntimeSettings('r1::wt').activeRuntimeEnvironmentId).toBe(
      'env-1'
    )
  })
})
