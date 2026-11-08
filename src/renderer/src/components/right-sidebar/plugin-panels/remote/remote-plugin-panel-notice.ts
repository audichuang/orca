import { translate } from '@/i18n/i18n'
import type { RemotePluginPanelRoute } from './use-remote-plugin-panel-route'

/** Why a panel routed to a paired server cannot show yet; null once it can. */
export function remotePluginPanelNotice(
  route: RemotePluginPanelRoute,
  pluginName: string,
  declarative: boolean
): string | null {
  if (route.kind === 'local') {
    return null
  }
  const host = route.hostName
  if (declarative) {
    return translate(
      'auto.components.right.sidebar.RemotePluginPanel.declarative',
      'This panel shows only this computer. It cannot show data from {{host}}.',
      { host }
    )
  }
  switch (route.status) {
    case 'ready':
      return null
    case 'loading':
      return translate(
        'auto.components.right.sidebar.RemotePluginPanel.loading',
        'Connecting to {{plugin}} on {{host}}...',
        {
          plugin: pluginName,
          host
        }
      )
    case 'unreachable':
      return translate(
        'auto.components.right.sidebar.RemotePluginPanel.unreachable',
        'Could not reach {{host}}.',
        { host }
      )
    case 'missing':
      return translate(
        'auto.components.right.sidebar.RemotePluginPanel.missing',
        '{{plugin}} is not installed or not enabled on {{host}}. Install and enable it there to see that host here.',
        { plugin: pluginName, host }
      )
    case 'version-mismatch': {
      const versions = route.availability?.kind === 'version-mismatch' ? route.availability : null
      return translate(
        'auto.components.right.sidebar.RemotePluginPanel.versionMismatch',
        '{{plugin}} is {{remote}} on {{host}} and {{local}} here. Install the same version on both.',
        {
          plugin: pluginName,
          host,
          remote: versions?.remoteVersion ?? '',
          local: versions?.localVersion ?? ''
        }
      )
    }
  }
}
