// Moved from filesystem-git-status-handlers.ts when the fork's git:history graph and git:diff
// skipRenderLimit fields pushed it past max-lines; port upstream edits to these handlers here.
import { ipcMain } from 'electron'
import {
  appendFolderToGitignore,
  findKnownHugeFolderPathsToIgnore
} from '../../git/huge-folder-ignore'
import { resolveRegisteredWorktreePath } from '../worktrees/removal/registered-worktree-roots-cache'
import type { FilesystemHandlerContext } from './filesystem-handler-context'
import { readWorktreeGitUnlessWslStopped } from './wsl-gated-worktree-git-read'

export function registerFilesystemGitignoreHandlers({ store }: FilesystemHandlerContext): void {
  ipcMain.handle(
    'git:findHugeFoldersToIgnore',
    async (_event, args: { worktreePath: string }): Promise<string[]> =>
      readWorktreeGitUnlessWslStopped(store, args.worktreePath, false, (worktreePath, gitOptions) =>
        findKnownHugeFolderPathsToIgnore(worktreePath, gitOptions)
      )
  )

  ipcMain.handle(
    'git:appendGitignore',
    async (_event, args: { worktreePath: string; folderName: string }): Promise<boolean> => {
      const worktreePath = await resolveRegisteredWorktreePath(args.worktreePath, store)
      return appendFolderToGitignore(worktreePath, args.folderName)
    }
  )
}
