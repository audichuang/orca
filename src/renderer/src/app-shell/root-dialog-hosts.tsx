// Fork-only: store-driven dialog hosts, kept out of AppRootSurfaces so the ClipCode host does not push it past max-lines.
// <WslMoveDialogHost /> and its comment moved here from AppRootSurfaces.tsx; port upstream edits to that mount here.
import { WslMoveDialogHost } from '../components/wsl-move/WslMoveDialog'
import { ClipcodeNonTextCopyDialogHost } from '@/components/right-sidebar/source-control/clipcode/clipcode-non-text-copy-dialog'

export function RootDialogHosts(): React.JSX.Element {
  return (
    <>
      {/* Own store, not activeModal: another modal must never evict a running move. */}
      <WslMoveDialogHost />
      {/* ClipCode copy question; every copy entry point (source control, explorer) asks through it. */}
      <ClipcodeNonTextCopyDialogHost />
    </>
  )
}
