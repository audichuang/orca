const SELECTION_KEYS = ['ArrowUp', 'ArrowDown', 'Home', 'End'] as const
export type FolderRepoSelectionKey = (typeof SELECTION_KEYS)[number]

export function isFolderRepoSelectionKey(key: string): key is FolderRepoSelectionKey {
  return SELECTION_KEYS.some((candidate) => candidate === key)
}

// Why: the panel remounts per folder workspace, so the pick lives outside React to survive switching away and back.
const rememberedByFolder = new Map<string, string>()

export function getRememberedFolderRepo(folderWorkspaceKey: string): string | null {
  return rememberedByFolder.get(folderWorkspaceKey) ?? null
}

export function rememberFolderRepo(folderWorkspaceKey: string, repoId: string): void {
  rememberedByFolder.set(folderWorkspaceKey, repoId)
}

const collapsedFolders = new Set<string>()

export function isFolderRepoListCollapsed(folderWorkspaceKey: string): boolean {
  return collapsedFolders.has(folderWorkspaceKey)
}

export function rememberFolderRepoListCollapsed(
  folderWorkspaceKey: string,
  collapsed: boolean
): void {
  if (collapsed) {
    collapsedFolders.add(folderWorkspaceKey)
  } else {
    collapsedFolders.delete(folderWorkspaceKey)
  }
}

/** The explicit pick wins, then the frozen default, then the first dirty repo, then the first repo. */
export function resolveSelectedRepoId(args: {
  chosenId: string | null
  defaultId: string | null
  ids: readonly string[]
  firstDirtyId: string | undefined
}): string {
  const { chosenId, defaultId, ids, firstDirtyId } = args
  if (chosenId !== null && ids.includes(chosenId)) {
    return chosenId
  }
  if (defaultId !== null && ids.includes(defaultId)) {
    return defaultId
  }
  return firstDirtyId ?? ids[0] ?? ''
}

export function moveRepoSelection(
  ids: readonly string[],
  currentId: string,
  key: FolderRepoSelectionKey
): string | undefined {
  if (ids.length === 0) {
    return undefined
  }
  const index = ids.indexOf(currentId)
  if (key === 'Home') {
    return ids[0]
  }
  if (key === 'End') {
    return ids.at(-1)
  }
  const next = key === 'ArrowDown' ? index + 1 : index - 1
  return ids[Math.min(ids.length - 1, Math.max(0, next))]
}

/**
 * The landing repo: the first repo in list order with changes, or the first repo once all are clean.
 * Null while an earlier repo's status is still unknown, so whichever repo happened to load first can't win.
 */
export function resolveFolderDefaultRepo(
  ids: readonly string[],
  changeCounts: readonly (number | undefined)[]
): string | null {
  for (let i = 0; i < ids.length; i++) {
    const count = changeCounts[i]
    if (count === undefined) {
      return null
    }
    if (count > 0) {
      return ids[i]
    }
  }
  return ids[0] ?? null
}
