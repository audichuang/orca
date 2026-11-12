import { useMemo, useState, type RefObject } from 'react'
import type { PluginFrameElement } from '../../../plugins/frames/plugin-frame-element'
import type { RemotePluginPanelRoute } from './use-remote-plugin-panel-route'

/**
 * Upstream remounts a panel frame only with a new entry revision, so a frame key is never mounted
 * twice. The fork also unmounts it for a remote notice and remounts it on a host switch, so no
 * state from the previous host's data lingers; this gives every mount an unused key (and the
 * frame ref a new identity) so upstream's load, watchdog and draw state never carry over to a
 * frame that has not loaded yet.
 */
export function usePluginFrameMount(
  frameRef: RefObject<PluginFrameElement | null>,
  panelFrameKey: string | null,
  route: RemotePluginPanelRoute
): { key: string | null; ref: RefObject<PluginFrameElement | null> } {
  const host = route.kind === 'remote' ? route.environmentId : 'local'
  const frameKey = panelFrameKey === null ? null : `${host}:${panelFrameKey}`
  const [mount, setMount] = useState({ frameKey, generation: 0 })
  let current = mount
  if (mount.frameKey !== frameKey) {
    current = { frameKey, generation: frameKey === null ? mount.generation : mount.generation + 1 }
    setMount(current)
  }
  const key = current.frameKey === null ? null : `${current.frameKey}#${current.generation}`
  const ref = useMemo(
    () => ({
      get current() {
        return frameRef.current
      },
      set current(value) {
        frameRef.current = value
      }
    }),
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- key only renews the identity
    [frameRef, key]
  )
  return { key, ref }
}
