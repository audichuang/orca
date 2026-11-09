import { parseExecutionHostId } from '../../../../../../shared/execution-host'
import {
  runtimeHostPlatform,
  sshTargetRemotePlatform,
  type PtyOwnerMachineState
} from '@/components/terminal-pane/pty-transport/host-ownership/pty-owner-machine-platform'
import type { FileExplorerOperationOwner } from '../../file-explorer/tree/file-explorer-types'

/** OS of the host whose disk a restore writes to, or null until that host has reported it. */
export function clipcodeRestoreTargetPlatform(
  owner: FileExplorerOperationOwner,
  state: PtyOwnerMachineState,
  clientPlatform: NodeJS.Platform
): NodeJS.Platform | null {
  switch (owner.kind) {
    case 'local':
      return clientPlatform
    case 'ssh':
      return sshTargetRemotePlatform(state, owner.connectionId, null)
    case 'runtime': {
      const host = parseExecutionHostId(owner.executionHostId)
      return host?.kind === 'ssh'
        ? sshTargetRemotePlatform(state, host.targetId, owner.environmentId)
        : runtimeHostPlatform(state, owner.environmentId)
    }
    case 'unresolved':
      return null
  }
}
