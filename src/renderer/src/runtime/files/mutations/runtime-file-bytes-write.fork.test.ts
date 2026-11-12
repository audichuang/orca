// Fork: ClipCode restore saves long-named files on remote hosts through this upstream upload path.
import { expect, it } from 'vitest'
import { writeRuntimeFileBytes } from './runtime-file-bytes-write'
import { FILE_MUTATION_OWNERSHIP_RUNTIME_CAPABILITY } from '../../../../../shared/file-access/files-runtime-capabilities'
import { FILE_REPLACE_WITH_UPLOAD_RUNTIME_CAPABILITY } from '../../../../../shared/file-write/file-bytes-write'
import {
  MIN_COMPATIBLE_RUNTIME_CLIENT_VERSION,
  RUNTIME_PROTOCOL_VERSION
} from '../../../../../shared/protocol-version'
import {
  installRuntimeFileClientEnvironment,
  runtimeEnvironmentTransportCall,
  type RuntimeRpcRequest
} from '../runtime-file-client-test-harness'

installRuntimeFileClientEnvironment()

function rpcOk(result: unknown) {
  return { id: 'rpc', ok: true, result, _meta: { runtimeId: 'remote-runtime' } }
}

it('uploads beside the file under a temp name that leaves out the file name', async () => {
  runtimeEnvironmentTransportCall.mockImplementation((args: RuntimeRpcRequest) =>
    Promise.resolve(
      args.method === 'status.get'
        ? rpcOk({
            runtimeId: 'remote-runtime',
            runtimeProtocolVersion: RUNTIME_PROTOCOL_VERSION,
            minCompatibleRuntimeClientVersion: MIN_COMPATIBLE_RUNTIME_CLIENT_VERSION,
            capabilities: [
              FILE_MUTATION_OWNERSHIP_RUNTIME_CAPABILITY,
              FILE_REPLACE_WITH_UPLOAD_RUNTIME_CAPABILITY
            ]
          })
        : rpcOk(args.method === 'files.replaceWithUpload' ? { ok: true } : {})
    )
  )
  const name = `${'n'.repeat(216)}.bin`

  await expect(
    writeRuntimeFileBytes(
      {
        target: { kind: 'environment', environmentId: 'env-1' },
        worktreeId: 'wt-1',
        worktreePath: '/remote/repo'
      },
      `/remote/repo/assets/${name}`,
      new Uint8Array([0x00, 0xff, 0x80]),
      undefined,
      { expectedSha256: 'a'.repeat(64) }
    )
  ).resolves.toEqual({ ok: true })

  const params = (method: string): unknown[] =>
    runtimeEnvironmentTransportCall.mock.calls
      .map(([args]) => args)
      .filter((args) => args.method === method)
      .map((args) => args.params)
  const [chunk] = params('files.writeBase64Chunk')
  const tempRelativePath = relativePathOf(chunk)
  expect(tempRelativePath).toMatch(/^assets\/\.orca-save-[0-9a-z]+-[0-9a-z]+$/)
  expect(params('files.replaceWithUpload')).toEqual([
    expect.objectContaining({
      tempRelativePath,
      finalRelativePath: `assets/${name}`
    })
  ])
})

function relativePathOf(params: unknown): string | undefined {
  return typeof params === 'object' &&
    params !== null &&
    'relativePath' in params &&
    typeof params.relativePath === 'string'
    ? params.relativePath
    : undefined
}
