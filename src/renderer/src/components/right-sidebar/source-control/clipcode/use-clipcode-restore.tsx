import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { createParentDirectoriesForNewFile } from './clipcode-restore-parent-directories'
import { translate } from '@/i18n/i18n'
import { readIpcErrorMessage } from '@/runtime/errors/ipc-error'
import { joinPath } from '@/lib/path'
import {
  deleteRuntimePath,
  writeRuntimeFile
} from '@/runtime/files/mutations/runtime-file-mutation-client'
import { writeRuntimeFileBytes } from '@/runtime/files/mutations/runtime-file-bytes-write'
import { FILE_BYTES_SAVE_UPDATE_REQUIRED_MESSAGE } from '../../../../../../shared/file-write/file-bytes-write'
import type { RuntimeFileOperationArgs } from '@/runtime/files/runtime-file-client-types'
import { notifyEditorExternalFileChange } from '@/components/editor/autosave/editor-autosave'
import {
  releaseEditorSaveHolds,
  requestEditorSaveQuiesceAll
} from '@/components/editor/editor-save-quiesce-batch'
import { relativePathInsideRoot } from '../../../../../../shared/cross-platform-path'
import {
  captureFileExplorerOperationGuard,
  getFileExplorerOperationOwner
} from '../../file-explorer/navigation/file-explorer-operation-owner'
import type { RestoreDirectoryCache } from './clipcode-restore-path-guard'
import {
  isRestorePathBlocked,
  readCandidateState,
  readExistingSha256,
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

// Why: the row shows user text, never a raw OS or IPC message (spec "Pasting").
function restoreRowErrorText(error: unknown): string {
  const message = readIpcErrorMessage(error) ?? String(error)
  // Why: an older remote host cannot take bytes; that message is already user text and says what to do.
  if (message.includes(FILE_BYTES_SAVE_UPDATE_REQUIRED_MESSAGE)) {
    return FILE_BYTES_SAVE_UPDATE_REQUIRED_MESSAGE
  }
  if (/\b(EACCES|EPERM)\b|permission denied/i.test(message)) {
    return translate(
      'auto.components.right.sidebar.source.control.clipcode.use.clipcode.restore.folderNotWritable',
      'Folder is not writable'
    )
  }
  if (/\bENOTDIR\b|not a directory/i.test(message)) {
    return translate(
      'auto.components.right.sidebar.source.control.clipcode.use.clipcode.restore.parentIsFile',
      'A file is in the way of its parent folder'
    )
  }
  if (/\bEISDIR\b|is a directory/i.test(message)) {
    return translate(
      'auto.components.right.sidebar.source.control.clipcode.use.clipcode.restore.targetIsFolder',
      'The target is a folder'
    )
  }
  return translate(
    'auto.components.right.sidebar.source.control.clipcode.use.clipcode.restore.writeFailed',
    'Could not write the file'
  )
}

type RestoreSession = {
  pending: PendingClipcodeRestore
  context: RuntimeFileOperationArgs
  assertCurrent: () => unknown
  rootPath: string
}

/** Paste & Restore for a repo, worktree or folder workspace: reads the clipboard, previews the plan, then writes under rootPath through the file explorer's owner route. */
export function useClipcodeRestore({
  workspaceKey,
  rootPath,
  repoWorktrees = [],
  onRestored
}: {
  workspaceKey: string
  rootPath: string
  /** Folder workspace member repo worktrees (empty otherwise): tabs they own also hold restored files and must be quiesced/notified. */
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
          workspaceKey,
          getFileExplorerOperationOwner(workspaceKey)
        )
        const context: RuntimeFileOperationArgs = {
          ...guard.route,
          worktreeId: workspaceKey,
          worktreePath: rootPath
        }
        const sourceRoot = extractSourceRoot(text)
        const safeSourceRoot = sourceRoot ? sanitizeRelativePath(sourceRoot) : undefined
        const sourceRootIsDirectory =
          safeSourceRoot !== undefined && !safeSourceRoot.includes('/')
            ? (await readTargetState(context, joinPath(rootPath, safeSourceRoot)).catch(
                () => 'unreadable'
              )) === 'directory'
            : false
        const suggestion = suggestRestoreBase({
          rootPath,
          relativePaths: entries.map((entry) => entry.path),
          sourceRoot: safeSourceRoot,
          sourceRootIsDirectory
        })
        // Both base choices stay selectable in the dialog, so stat every path either one can target.
        const candidatePaths = new Set<string>()
        const nonTextSizes = new Map<string, Set<number>>()
        for (const base of suggestion ? [undefined, suggestion.base] : [undefined]) {
          const plan = planClipcodeRestore({ rootPath, entries, base })
          for (const item of [...plan.writes, ...plan.deletes]) {
            candidatePaths.add(item.relativePath)
          }
          for (const write of plan.writes) {
            if ('bytes' in write) {
              const sizes = nonTextSizes.get(write.relativePath) ?? new Set<number>()
              nonTextSizes.set(write.relativePath, sizes.add(write.bytes.length))
            }
          }
        }
        const states = new Map<string, ClipcodeTargetState>()
        const directoryCache: RestoreDirectoryCache = new Map()
        for (const relativePath of candidatePaths) {
          states.set(
            relativePath,
            await readCandidateState(context, rootPath, relativePath, directoryCache)
          )
        }
        // Why: a non-text target already holding the pasted bytes is shown Unchanged and never written.
        const existingSha256 = new Map<string, string>()
        for (const [relativePath, sizes] of nonTextSizes) {
          const state = states.get(relativePath)
          if (state !== 'file' && state !== 'nonUtf8File' && state !== 'unverifiedFile') {
            continue
          }
          for (const size of sizes) {
            const sha = await readExistingSha256(context, rootPath, relativePath, size)
            if (sha) {
              existingSha256.set(relativePath, sha)
              break
            }
          }
        }
        setSession({
          pending: { rootPath, entries, suggestion, states, existingSha256 },
          context,
          assertCurrent: guard.assertCurrent,
          rootPath
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
  }, [rootPath, workspaceKey])

  const confirm = useCallback(
    async ({ preview, overwrite }: ConfirmedClipcodeRestore) => {
      const current = session
      setSession(null)
      if (!current) {
        return
      }
      const { context, rootPath: root } = current
      const errors: string[] = []
      let failedRows = 0
      let created = 0
      let overwritten = 0
      let deleted = 0
      let staleSkipped = 0
      try {
        current.assertCurrent()
        // Why: the same file can be open under the folder key or under the repo worktree owning it.
        // ponytail: overlapping folder workspaces are not quiesced; match openFiles by absolute path if that setup appears.
        const editorTargets = (relativePath: string) => {
          const absolutePath = joinPath(root, relativePath)
          const targets = [{ worktreeId: workspaceKey, worktreePath: root, relativePath }]
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
        const quiesceEditors = (relativePath: string) =>
          requestEditorSaveQuiesceAll(editorTargets(relativePath))
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
          let holds: (() => void)[] = []
          try {
            // Why: the preview can be stale; re-list with a fresh cache right before touching the path.
            if (await isRestorePathBlocked(context, root, write.relativePath, new Map())) {
              staleSkipped++
              continue
            }
            // Why: a save already in flight must not land after the restore and overwrite it.
            holds = await quiesceEditors(write.relativePath)
            if (write.isNew) {
              // Why: the preview can be stale; a file created since must not be clobbered when overwrite is off.
              const state = await readTargetState(context, joinPath(root, write.relativePath))
              if (state === 'directory' || (state === 'file' && !overwrite)) {
                staleSkipped++
                continue
              }
              await createParentDirectoriesForNewFile({
                context,
                relativePath: write.relativePath,
                worktreePath: root
              })
            }
            const filePath = joinPath(root, write.relativePath)
            // Why: no expected hash means an explicit overwrite, already gated by the overwrite option.
            await ('bytes' in write
              ? writeRuntimeFileBytes(context, filePath, write.bytes, undefined, {
                  allowMissing: true
                })
              : writeRuntimeFile(context, filePath, write.content))
            notifyEditors(write.relativePath)
            if (write.isNew) {
              created++
            } else {
              overwritten++
            }
          } catch (error) {
            failedRows++
            errors.push(`${write.relativePath}: ${restoreRowErrorText(error)}`)
          } finally {
            releaseEditorSaveHolds(holds)
          }
        }
        for (const item of preview.delete) {
          current.assertCurrent()
          let holds: (() => void)[] = []
          try {
            if (await isRestorePathBlocked(context, root, item.relativePath, new Map())) {
              staleSkipped++
              continue
            }
            holds = await quiesceEditors(item.relativePath)
            await deleteRuntimePath(context, joinPath(root, item.relativePath), false)
            notifyEditors(item.relativePath)
            deleted++
          } catch (error) {
            failedRows++
            errors.push(`${item.relativePath}: ${restoreRowErrorText(error)}`)
          } finally {
            releaseEditorSaveHolds(holds)
          }
        }
      } catch (error) {
        errors.push(readIpcErrorMessage(error) ?? String(error))
      }
      // Why: a row that failed while writing was skipped too, so the title must count it.
      const skipped =
        preview.skipped.length +
        (overwrite ? 0 : preview.overwrite.length) +
        staleSkipped +
        failedRows
      const counts = translate(
        'auto.components.right.sidebar.source.control.clipcode.use.clipcode.restore.ae1ec38ef1',
        'Created {{value0}}, overwritten {{value1}}, deleted {{value2}}, skipped {{value3}}.',
        { value0: created, value1: overwritten, value2: deleted, value3: skipped }
      )
      const summary =
        preview.unchanged.length > 0
          ? `${counts} ${translate(
              'auto.components.right.sidebar.source.control.clipcode.use.clipcode.restore.unchanged',
              'Unchanged: {{value0}}.',
              { value0: preview.unchanged.length }
            )}`
          : counts
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
    [workspaceKey, onRestored, repoWorktrees, session]
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
