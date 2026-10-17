import type { EditorExternalWatchTarget } from './editor-external-watch-targets'

/**
 * Targets that should all receive one same-root watch batch. Payloads carry no host, so only
 * fan out when every candidate shares a connection; otherwise keep the first match as before.
 */
export function selectSameHostWatchTargets(
  candidates: readonly EditorExternalWatchTarget[]
): readonly EditorExternalWatchTarget[] {
  if (candidates.length <= 1) {
    return candidates
  }
  const connectionId = candidates[0].connectionId ?? null
  return candidates.every((target) => (target.connectionId ?? null) === connectionId)
    ? candidates
    : candidates.slice(0, 1)
}
