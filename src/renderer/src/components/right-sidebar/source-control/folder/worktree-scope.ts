import { createContext, useContext } from 'react'

/** Pins a Source Control panel to one repo of a folder workspace instead of the active worktree. */
export type SourceControlWorktreeScope = {
  /** Worktree whose git state the panel reads and mutates. */
  gitWorktreeId: string
  /** Worktree whose editor receives the tabs the panel opens (the active folder workspace). */
  editorWorktreeId: string
  /** Repo name shown in the panel toolbar so the detail pane names what it shows. */
  label?: string
  /** Repo colour mark beside the label. */
  color?: string
}

export const SourceControlWorktreeScopeContext = createContext<SourceControlWorktreeScope | null>(
  null
)

export function useSourceControlWorktreeScope(): SourceControlWorktreeScope | null {
  return useContext(SourceControlWorktreeScopeContext)
}
