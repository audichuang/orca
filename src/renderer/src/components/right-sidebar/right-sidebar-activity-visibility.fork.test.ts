import { describe, expect, it } from 'vitest'
import { Files } from 'lucide-react'
import type { ActivityBarItem } from './activity-bar-buttons'
import { getVisibleRightSidebarActivityItems } from './right-sidebar-activity-visibility'

const items: ActivityBarItem[] = [
  { id: 'explorer', icon: Files, title: 'Explorer', shortcut: '' },
  {
    id: 'source-control',
    icon: Files,
    title: 'Source Control',
    shortcut: '',
    gitOnly: true,
    inFolderWorkspace: true
  },
  { id: 'checks', icon: Files, title: 'Checks', shortcut: '', gitOnly: true }
]

describe('getVisibleRightSidebarActivityItems in a folder workspace', () => {
  it('keeps git tabs flagged for folder workspaces, which list the git repos under the folder', () => {
    const visible = (isFolderWorkspace: boolean): string[] =>
      getVisibleRightSidebarActivityItems(items, {
        isFolder: true,
        isFolderWorkspace,
        hasSshHost: false
      }).map((item) => item.id)

    expect(visible(true)).toEqual(['explorer', 'source-control'])
    expect(visible(false)).toEqual(['explorer'])
    expect(
      getVisibleRightSidebarActivityItems(items, {
        isFolder: false,
        isFolderWorkspace: false,
        hasSshHost: false
      }).map((item) => item.id)
    ).toEqual(['explorer', 'source-control', 'checks'])
  })
})
