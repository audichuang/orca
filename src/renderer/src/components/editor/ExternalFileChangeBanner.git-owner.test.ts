import { describe, expect, it, vi } from 'vitest'
import {
  installRuntimeFileClientEnvironment,
  runtimeEnvironmentCall
} from '@/runtime/runtime-file-client-test-harness'
import { keepTabEditsOverExternalChange } from './ExternalFileChangeBanner'

installRuntimeFileClientEnvironment()

describe('folder-owned tab reads on a paired runtime', () => {
  it('addresses the repo worktree, not the folder owner, for files.read', async () => {
    runtimeEnvironmentCall.mockResolvedValue({
      id: 'rpc-1',
      ok: true,
      result: {
        worktree: 'id:repo-a',
        relativePath: 'src/x.ts',
        content: 'x',
        truncated: false,
        byteLength: 1
      },
      _meta: { runtimeId: 'remote-runtime' }
    })
    keepTabEditsOverExternalChange({
      id: '/f/a/src/x.ts',
      filePath: '/f/a/src/x.ts',
      relativePath: 'src/x.ts',
      worktreeId: 'folder:f1',
      gitWorktreeId: 'repo-a',
      runtimeEnvironmentId: 'env-1',
      language: 'typescript',
      isDirty: false,
      mode: 'edit'
    })
    await vi.waitFor(() =>
      expect(runtimeEnvironmentCall).toHaveBeenCalledWith(
        expect.objectContaining({
          selector: 'env-1',
          method: 'files.read',
          params: { worktree: 'id:repo-a', relativePath: 'src/x.ts' }
        })
      )
    )
  })
})
