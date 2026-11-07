// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it } from 'vitest'
import { useAppStore } from '@/store'
import type { FolderWorkspace } from '../../../../../../shared/folder-workspaces/folder-workspace-types'
import {
  isRepoHiddenFromSidebar,
  resetFolderSidebarHiddenReposForTest,
  setReposHiddenFromSidebar
} from '../../../right-sidebar/source-control/folder/folder-sidebar-hidden-repos'
import { deleteFolderWorkspaceUnlessUnsaved } from './folder-workspace-delete'

const FOLDER: FolderWorkspace = {
  id: 'folder-1',
  projectGroupId: 'group-1',
  name: 'Platform',
  folderPath: '/work/folder',
  connectionId: null,
  linkedTask: null,
  comment: '',
  isArchived: false,
  isUnread: false,
  isPinned: false,
  sortOrder: 1,
  lastActivityAt: 0,
  createdAt: 1,
  updatedAt: 1
}
const HIDDEN_REPO = { path: '/work/folder/hidden-repo', connectionId: null }

beforeEach(() => {
  localStorage.clear()
  resetFolderSidebarHiddenReposForTest()
  useAppStore.setState({
    folderWorkspaces: [FOLDER],
    deleteFolderWorkspace: async () => {
      useAppStore.setState({ folderWorkspaces: [] })
      return true
    }
  })
})

afterEach(() => {
  useAppStore.setState(useAppStore.getInitialState(), true)
})

it('shows a repo again in the sidebar once its only folder is deleted', async () => {
  setReposHiddenFromSidebar([HIDDEN_REPO], true)

  await expect(deleteFolderWorkspaceUnlessUnsaved(useAppStore.getState, FOLDER.id)).resolves.toBe(
    true
  )

  expect(isRepoHiddenFromSidebar(HIDDEN_REPO)).toBe(false)
})
