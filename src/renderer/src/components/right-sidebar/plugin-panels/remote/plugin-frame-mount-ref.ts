import { useMemo, type RefObject } from 'react'
import type { PluginFrameElement } from '../../../plugins/frames/plugin-frame-element'

/**
 * The same frame ref under a new identity for every mounted frame, so upstream hooks keyed on the
 * ref rebind when the fork remounts the frame (host switch, remote notice clearing).
 */
export function usePluginFrameMountRef(
  frameRef: RefObject<PluginFrameElement | null>,
  mountKey: string | null
): RefObject<PluginFrameElement | null> {
  return useMemo(
    () => ({
      get current() {
        return frameRef.current
      },
      set current(value) {
        frameRef.current = value
      }
    }),
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- mountKey only renews the identity
    [frameRef, mountKey]
  )
}
