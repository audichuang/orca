import { describe, expect, it } from 'vitest'
import type { PtyOwnerMachineState } from '@/components/terminal-pane/pty-transport/host-ownership/pty-owner-machine-platform'
import { clipcodeRestoreTargetPlatform } from './clipcode-restore-target-platform'

function machineState(): PtyOwnerMachineState {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the resolver reads only remotePlatform and hostPlatform from these maps.
  return {
    sshConnectionStates: new Map([['box', { remotePlatform: 'linux' }]]),
    sshStateByEnvironment: new Map([
      ['env', { connectionStates: new Map([['inner', { remotePlatform: 'win32' }]]) }]
    ]),
    runtimeStatusByEnvironmentId: new Map([
      ['env', { kind: 'ready', status: { hostPlatform: 'darwin' } }]
    ])
  } as unknown as PtyOwnerMachineState
}

describe('clipcodeRestoreTargetPlatform', () => {
  it('uses the client OS for a local folder', () => {
    expect(clipcodeRestoreTargetPlatform({ kind: 'local' }, machineState(), 'win32')).toBe('win32')
  })

  it('uses the OS a direct SSH target reports', () => {
    expect(
      clipcodeRestoreTargetPlatform({ kind: 'ssh', connectionId: 'box' }, machineState(), 'darwin')
    ).toBe('linux')
  })

  it("uses a paired server's own OS, not the client's", () => {
    expect(
      clipcodeRestoreTargetPlatform(
        { kind: 'runtime', environmentId: 'env', executionHostId: 'local' },
        machineState(),
        'linux'
      )
    ).toBe('darwin')
  })

  it("uses the OS of a paired server's SSH target", () => {
    expect(
      clipcodeRestoreTargetPlatform(
        { kind: 'runtime', environmentId: 'env', executionHostId: 'ssh:inner' },
        machineState(),
        'darwin'
      )
    ).toBe('win32')
  })

  it('is unknown while an SSH target has not reported its OS', () => {
    expect(
      clipcodeRestoreTargetPlatform({ kind: 'ssh', connectionId: 'new' }, machineState(), 'darwin')
    ).toBeNull()
  })
})
