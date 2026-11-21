import { describe, expect, it } from 'vitest'
import type { PtyOwnerMachineState } from '@/components/terminal-pane/pty-transport/host-ownership/pty-owner-machine-platform'
import type { RuntimeStatuses } from '@/store/slices/runtime-status/views/runtime-status-owner'
import { clipcodeRestoreTargetPlatform } from './clipcode-restore-target-platform'

function machineState(): PtyOwnerMachineState {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the resolver reads only remotePlatform and hostPlatform from these maps.
  return {
    sshConnectionStates: new Map([['box', { remotePlatform: 'linux' }]]),
    sshStateByEnvironment: new Map([
      ['env', { connectionStates: new Map([['inner', { remotePlatform: 'win32' }]]) }]
    ])
  } as unknown as PtyOwnerMachineState
}

function statuses(): RuntimeStatuses {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the resolver reads only hostPlatform from a ready entry.
  return new Map([
    ['env', { kind: 'ready', status: { hostPlatform: 'darwin' } }]
  ]) as unknown as RuntimeStatuses
}

describe('clipcodeRestoreTargetPlatform', () => {
  it('uses the client OS for a local folder', () => {
    expect(
      clipcodeRestoreTargetPlatform({ kind: 'local' }, machineState(), statuses(), 'win32')
    ).toBe('win32')
  })

  it('uses the OS a direct SSH target reports', () => {
    expect(
      clipcodeRestoreTargetPlatform(
        { kind: 'ssh', connectionId: 'box' },
        machineState(),
        statuses(),
        'darwin'
      )
    ).toBe('linux')
  })

  it("uses a paired server's own OS, not the client's", () => {
    expect(
      clipcodeRestoreTargetPlatform(
        { kind: 'runtime', environmentId: 'env', executionHostId: 'local' },
        machineState(),
        statuses(),
        'linux'
      )
    ).toBe('darwin')
  })

  it("uses the OS of a paired server's SSH target", () => {
    expect(
      clipcodeRestoreTargetPlatform(
        { kind: 'runtime', environmentId: 'env', executionHostId: 'ssh:inner' },
        machineState(),
        statuses(),
        'darwin'
      )
    ).toBe('win32')
  })

  it('is unknown while an SSH target has not reported its OS', () => {
    expect(
      clipcodeRestoreTargetPlatform(
        { kind: 'ssh', connectionId: 'new' },
        machineState(),
        statuses(),
        'darwin'
      )
    ).toBeNull()
  })
})
