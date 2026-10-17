import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { createParentDirectoriesForNewFile } from '@/components/tab-bar/tab-create-entry-action'
import { translate } from '@/i18n/i18n'
import { readIpcErrorMessage } from '@/lib/ipc-error'
import { joinPath } from '@/lib/path'
import {
  deleteRuntimePath,
  createRuntimePath,
  writeRuntimeFile
} from '@/runtime/runtime-file-mutation-client'
import { statRuntimePath } from '@/runtime/runtime-file-metadata-client'
import type { RuntimeFileOperationArgs } from '@/runtime/runtime-file-client-types'
import {
  notifyEditorExternalFileChange,
  requestEditorSaveQuiesce
} from '@/components/editor/editor-autosave'
import { relativePathInsideRoot } from '../../../../../../shared/cross-platform-path'
import {
  captureFileExplorerOperationGuard,
  getFileExplorerOperationOwner
} from '../../file-explorer-operation-owner'
import type { RestoreDirectoryCache } from './clipcode-restore-path-guard'
import {
  isRestorePathBlocked,
  readCandidateState,
  readTargetState
} from './clipcode-restore-target-state'
import { CLIPCODE_DEFAULTS, extractSourceRoot, parseClipboard } from './clipcode-clipboard-format'
import {
  ClipcodeRestorePreviewDialog,
  type ConfirmedClipcodeRestore,
  type PendingClipcodeRestore
} from './clipcode-restore-preview-dialog'
import {
  planClipcodeRestore,
  sanitizeRelativePath,
  suggestRestoreBase,
  type ClipcodeTargetState
} from './clipcode-restore-plan'

type RestoreSession = {
  pending: PendingClipcodeRestore
  context: RuntimeFileOperationArgs
  assertCurrent: () => unknown
  folderPath: string
}

/** Paste & Restore for a folder workspace: reads the clipboard, previews the plan, then writes through the file explorer's owner route. */
export function useClipcodeRestore({
  folderWorkspaceKey,
  folderPath,
  repoWorktrees = [],
  onRestored
}: {
  folderWorkspaceKey: string
  folderPath: string
  /** Member repo worktrees: tabs they own also hold restored files and must be quiesced/notified. */
  repoWorktrees?: readonly { id: string; path: string }[]
  onRestored: () => void
}): { requestRestore: () => void; dialog: React.ReactNode } {
  const [session, setSession] = useState<RestoreSession | null>(null)

  const requestRestore = useCallback(() => {
    void (async () => {
      try {
        const text = await window.api.ui.readClipboardText()
        if (!text.trim()) {
          toast.warning(
            translate(
              'auto.components.right.sidebar.source.control.clipcode.use.clipcode.restore.b124e9c64e',
              'Clipboard is empty or does not contain text.'
            )
          )
          return
        }
        const entries = parseClipboard(text, CLIPCODE_DEFAULTS.headerFormat)
        if (entries.length === 0) {
          toast.warning(
            translate(
              'auto.components.right.sidebar.source.control.clipcode.use.clipcode.restore.1847420a23',
              'No Snipcode file headers found in clipboard.'
            )
          )
          return
        }
        const guard = captureFileExplorerOperationGuard(
          folderWorkspaceKey,
          getFileExplorerOperationOwner(folderWorkspaceKey)
        )
        const context: RuntimeFileOperationArgs = {
          ...guard.route,
          worktreeId: folderWorkspaceKey,
          worktreePath: folderPath
        }
        const sourceRoot = extractSourceRoot(text)
        const safeSourceRoot = sourceRoot ? sanitizeRelativePath(sourceRoot) : undefined
        const sourceRootIsDirectory =
          safeSourceRoot !== undefined && !safeSourceRoot.includes('/')
            ? (await readTargetState(context, joinPath(folderPath, safeSourceRoot)).catch(
                () => 'unreadable'
              )) === 'directory'
            : false
        const suggestion = suggestRestoreBase({
          rootPath: folderPath,
          relativePaths: entries.map((entry) => entry.path),
          sourceRoot: safeSourceRoot,
          sourceRootIsDirectory
        })
        // Both base choices stay selectable in the dialog, so stat every path either one can target.
        const candidatePaths = new Set<string>()
        for (const base of suggestion ? [undefined, suggestion.base] : [undefined]) {
          const plan = planClipcodeRestore({ rootPath: folderPath, entries, base })
          for (const item of [...plan.writes, ...plan.deletes]) {
            candidatePaths.add(item.relativePath)
          }
        }
        const states = new Map<string, ClipcodeTargetState>()
        const directoryCache: RestoreDirectoryCache = new Map()
        for (const relativePath of candidatePaths) {
          states.set(
            relativePath,
            await readCandidateState(context, folderPath, relativePath, directoryCache)
          )
        }
        setSession({
          pending: { rootPath: folderPath, entries, suggestion, states },
          context,
          assertCurrent: guard.assertCurrent,
          folderPath
        })
      } catch (error) {
        toast.error(
          translate(
            'auto.components.right.sidebar.source.control.clipcode.use.clipcode.restore.af5c90f593',
            'Paste & Restore failed'
          ),
          {
            description: readIpcErrorMessage(error)
          }
        )
      }
    })()
  }, [folderPath, folderWorkspaceKey])

  const confirm = useCallback(
    async ({ preview, overwrite }: ConfirmedClipcodeRestore) => {
      const current = session
      setSession(null)
      if (!current) {
        return
      }
      const { context, folderPath: root } = current
      const errors: string[] = []
      let created = 0
      let overwritten = 0
      let deleted = 0
      let staleSkipped = 0
      try {
        current.assertCurrent()
        const operations = { createRuntimePath, statRuntimePath }
        // Why: the same file can be open under the folder key or under the repo worktree owning it.
        // ponytail: overlapping folder workspaces are not quiesced; match openFiles by absolute path if that setup appears.
        const editorTargets = (relativePath: string) => {
          const absolutePath = joinPath(root, relativePath)
          const targets = [{ worktreeId: folderWorkspaceKey, worktreePath: root, relativePath }]
          for (const repoWorktree of repoWorktrees) {
            const repoRelative = relativePathInsideRoot(repoWorktree.path, absolutePath)
            if (repoRelative) {
              targets.push({
                worktreeId: repoWorktree.id,
                worktreePath: repoWorktree.path,
                relativePath: repoRelative
              })
            }
          }
          return targets
        }
        const quiesceEditors = async (relativePath: string) => {
          await Promise.all(editorTargets(relativePath).map(requestEditorSaveQuiesce))
        }
        const notifyEditors = (relativePath: string) => {
          for (const target of editorTargets(relativePath)) {
            notifyEditorExternalFileChange(target)
          }
        }
        const writes = [
          ...preview.create.map((item) => ({ ...item, isNew: true })),
          ...(overwrite ? preview.overwrite.map((item) => ({ ...item, isNew: false })) : [])
        ]
        for (const write of writes) {
          // Why: the owner may change while a long restore runs; stop instead of failing every remaining file.
          current.assertCurrent()
          try {
            // Why: the preview can be stale; re-list with a fresh cache right before touching the path.
            if (await isRestorePathBlocked(context, root, write.relativePath, new Map())) {
              staleSkipped++
              continue
            }
            // Why: a save already in flight must not land after the restore and overwrite it.
            await quiesceEditors(write.relativePath)
            if (write.isNew) {
              // Why: the preview can be stale; a file created since must not be clobbered when overwrite is off.
              const state = await readTargetState(context, joinPath(root, write.relativePath))
              if (state === 'directory' || (state === 'file' && !overwrite)) {
                staleSkipped++
                continue
              }
              await createParentDirectoriesForNewFile({
                context,
                operations,
                relativePath: write.relativePath,
                worktreePath: root
              })
            }
            await writeRuntimeFile(context, joinPath(root, write.relativePath), write.content)
            notifyEditors(write.relativePath)
            if (write.isNew) {
              created++
            } else {
              overwritten++
            }
          } catch (error) {
            errors.push(`${write.relativePath}: ${readIpcErrorMessage(error) ?? String(error)}`)
          }
        }
        for (const item of preview.delete) {
          current.assertCurrent()
          try {
            if (await isRestorePathBlocked(context, root, item.relativePath, new Map())) {
              staleSkipped++
              continue
            }
            await quiesceEditors(item.relativePath)
            await deleteRuntimePath(context, joinPath(root, item.relativePath), false)
            notifyEditors(item.relativePath)
            deleted++
          } catch (error) {
            errors.push(`${item.relativePath}: ${readIpcErrorMessage(error) ?? String(error)}`)
          }
        }
      } catch (error) {
        errors.push(readIpcErrorMessage(error) ?? String(error))
      }
      const skipped =
        preview.skipped.length + (overwrite ? 0 : preview.overwrite.length) + staleSkipped
      const summary = translate(
        'auto.components.right.sidebar.source.control.clipcode.use.clipcode.restore.ae1ec38ef1',
        'Created {{value0}}, overwritten {{value1}}, deleted {{value2}}, skipped {{value3}}.',
        { value0: created, value1: overwritten, value2: deleted, value3: skipped }
      )
      if (errors.length > 0) {
        const shown = errors.slice(0, 3)
        if (errors.length > shown.length) {
          shown.push(
            translate(
              'auto.components.right.sidebar.source.control.clipcode.use.clipcode.restore.19a6f378aa',
              '...and {{value0}} more',
              { value0: errors.length - shown.length }
            )
          )
        }
        toast.error(
          `${summary} ${translate(
            'auto.components.right.sidebar.source.control.clipcode.use.clipcode.restore.c9af35dc2d',
            'Failed {{value0}}.',
            { value0: errors.length }
          )}`,
          { description: shown.join('\n') }
        )
      } else {
        toast.success(summary)
      }
      onRestored()
    },
    [folderWorkspaceKey, onRestored, repoWorktrees, session]
  )

  const dialog = session ? (
    <ClipcodeRestorePreviewDialog
      pending={session.pending}
      onCancel={() => setSession(null)}
      onConfirm={(confirmed) => void confirm(confirmed)}
    />
  ) : null
  return { requestRestore, dialog }
}
