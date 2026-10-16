import type { ActivityBarItem } from './activity-bar-buttons'

type RightSidebarActivityVisibilityState = {
  isFolder: boolean
  isFolderWorkspace: boolean
  isSshRepo: boolean
}

export function getVisibleRightSidebarActivityItems(
  items: ActivityBarItem[],
  { isFolder, isFolderWorkspace, isSshRepo }: RightSidebarActivityVisibilityState
): ActivityBarItem[] {
  return items.filter(
    (item) =>
      (!item.gitOnly || !isFolder || (isFolderWorkspace && item.inFolderWorkspace === true)) &&
      (!item.folderOnly || isFolderWorkspace) &&
      (!item.sshOnly || isSshRepo)
  )
}
