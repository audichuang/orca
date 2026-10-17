import type { ParsedEntry } from './clipcode-clipboard-format'
import {
  planClipcodeRestore,
  type ClipcodeRestoreBase,
  type ClipcodeTargetState
} from './clipcode-restore-plan'

function existingTargetCount(
  args: { rootPath: string; entries: readonly ParsedEntry[]; base?: ClipcodeRestoreBase },
  states: ReadonlyMap<string, ClipcodeTargetState>
): number {
  const plan = planClipcodeRestore(args)
  return [...plan.writes, ...plan.deletes].filter(
    (item) => states.get(item.relativePath) === 'file'
  ).length
}

/**
 * Whether "Adjust paths" starts checked: only when the adjusted paths hit at least as many existing
 * files as the clipboard paths do, so files already in the right place are not nested one level deeper.
 */
export function defaultAdjustRestorePaths(pending: {
  rootPath: string
  entries: readonly ParsedEntry[]
  suggestion: { base: ClipcodeRestoreBase } | undefined
  states: ReadonlyMap<string, ClipcodeTargetState>
}): boolean {
  if (!pending.suggestion) {
    return false
  }
  const { rootPath, entries, states } = pending
  return (
    existingTargetCount({ rootPath, entries, base: pending.suggestion.base }, states) >=
    existingTargetCount({ rootPath, entries }, states)
  )
}
