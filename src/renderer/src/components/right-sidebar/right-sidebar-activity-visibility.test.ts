import { describe, expect, it } from 'vitest'
import { Files } from 'lucide-react'
import type { ActivityBarItem } from './activity-bar-buttons'
import { getVisibleRightSidebarActivityItems } from './right-sidebar-activity-visibility'

const items: ActivityBarItem[] = [
  { id: 'explorer', icon: Files, title: 'Explorer', shortcut: '' },
  {
    id: 'workspaces',
    icon: Files,
    title: 'Workspaces',
    shortcut: '',
    folderOnly: true
  },
  {
    id: 'pr-checks',
    icon: Files,
    title: 'PR Checks',
    shortcut: '',
    folderOnly: true
  },
  {
    id: 'source-control',
    icon: Files,
    title: 'Source Control',
    shortcut: '',
    gitOnly: true,
    inFolderWorkspace: true
  },
  { id: 'checks', icon: Files, title: 'Checks', shortcut: '', gitOnly: true },
  { id: 'ports', icon: Files, title: 'Ports', shortcut: '', sshOnly: true },
  // Plugin panels carry no visibility flags, so they show in every context.
  {
    id: 'plugin:orca-samples.my-plugin/dashboard',
    icon: Files,
    title: 'Dashboard',
    shortcut: ''
  }
]

describe('getVisibleRightSidebarActivityItems', () => {
  it('shows ports only for workspaces on an SSH host', () => {
    expect(
      getVisibleRightSidebarActivityItems(items, {
        isFolder: false,
        isFolderWorkspace: false,
        hasSshHost: false
      }).map((item) => item.id)
    ).toEqual(['explorer', 'source-control', 'checks', 'plugin:orca-samples.my-plugin/dashboard'])

    expect(
      getVisibleRightSidebarActivityItems(items, {
        isFolder: false,
        isFolderWorkspace: false,
        hasSshHost: true
      }).map((item) => item.id)
    ).toEqual([
      'explorer',
      'source-control',
      'checks',
      'ports',
      'plugin:orca-samples.my-plugin/dashboard'
    ])
  })

  it('shows Workspaces only for folder workspaces and hides git tabs for folder scopes', () => {
    expect(
      getVisibleRightSidebarActivityItems(items, {
        isFolder: true,
        isFolderWorkspace: true,
        hasSshHost: true
      }).map((item) => item.id)
    ).toEqual([
      'explorer',
      'workspaces',
      'pr-checks',
      // Folder workspaces keep Source Control: it lists the git repos under the folder.
      'source-control',
      'ports',
      'plugin:orca-samples.my-plugin/dashboard'
    ])

    expect(
      getVisibleRightSidebarActivityItems(items, {
        isFolder: true,
        isFolderWorkspace: false,
        hasSshHost: true
      }).map((item) => item.id)
    ).toEqual(['explorer', 'ports', 'plugin:orca-samples.my-plugin/dashboard'])
  })
})
