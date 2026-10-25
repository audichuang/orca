// Fork-only: the editor tab kinds this fork adds (the Git Graph tab), for upstream sites that list editor kinds.

import type { TabContentType } from './tab-types'

export const FORK_EDITOR_TAB_KINDS = ['git-graph'] as const satisfies readonly TabContentType[]

export type ForkEditorTabKind = (typeof FORK_EDITOR_TAB_KINDS)[number]

const FORK_KIND_SET: ReadonlySet<string> = new Set(FORK_EDITOR_TAB_KINDS)

/** True for a fork editor kind, whether given as a tab content type or an open file's mode. */
export function isForkEditorTabKind(kind: string): kind is ForkEditorTabKind {
  return FORK_KIND_SET.has(kind)
}

/** Adds the fork kinds to an upstream set of editor content types. */
export function addForkEditorTabKinds(kinds: Set<string>): void {
  for (const kind of FORK_EDITOR_TAB_KINDS) {
    kinds.add(kind)
  }
}
