// Fork-only: holds a folder's Git Graph tab back while arrow keys walk Source Control's repo list.

// Why debounce: each tab repo change remounts the graph and reads history; one per key would flood.
export const GIT_GRAPH_REPO_FOLLOW_DELAY_MS = 250

const timersByFolder = new Map<string, ReturnType<typeof setTimeout>>()

/** Runs `follow` once the folder's picks pause; a newer schedule replaces the pending one. */
export function scheduleGitGraphRepoFollow(folderWorkspaceKey: string, follow: () => void): void {
  cancelGitGraphRepoFollow(folderWorkspaceKey)
  timersByFolder.set(
    folderWorkspaceKey,
    setTimeout(() => {
      timersByFolder.delete(folderWorkspaceKey)
      follow()
    }, GIT_GRAPH_REPO_FOLLOW_DELAY_MS)
  )
}

export function cancelGitGraphRepoFollow(folderWorkspaceKey: string): void {
  const timer = timersByFolder.get(folderWorkspaceKey)
  if (timer !== undefined) {
    clearTimeout(timer)
    timersByFolder.delete(folderWorkspaceKey)
  }
}
