// Fork: ClipCode actions provider around the upstream ready panel.
import { SourceControlPanelReady } from '../panel/panel-ready'
import type { SourceControlPanelReadyProps } from '../panel/panel-props'
import { ClipcodeSourceControlActionsProvider } from './clipcode-source-control-actions'

export function ClipcodeSourceControlPanelReady(props: SourceControlPanelReadyProps) {
  return (
    <ClipcodeSourceControlActionsProvider model={props.model}>
      <SourceControlPanelReady {...props} />
    </ClipcodeSourceControlActionsProvider>
  )
}
