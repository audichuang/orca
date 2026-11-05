// Fork-only: "Duplicate as _result.txt" explorer menu item; the copy flow mirrors useFileDuplicate.
import { createContext, useContext } from 'react'
import type React from 'react'
import { FileOutput } from 'lucide-react'
import { toast } from 'sonner'
import { ContextMenuItem } from '@/components/ui/context-menu'
import { useAppStore } from '@/store'
import { detectLanguage } from '@/lib/language-detect'
import { translate } from '@/i18n/i18n'
import { basename, dirname, joinPath } from '@/lib/path'
import { copyRuntimePath } from '@/runtime/runtime-file-mutation-client'
import { runtimePathExists } from '@/runtime/runtime-file-metadata-client'
import { runtimeTargetEnvironmentId } from '@/runtime/runtime-client-target'
import type { TreeNode } from './file-explorer/tree/file-explorer-types'
import { captureFileExplorerOperationGuard } from './file-explorer/navigation/file-explorer-operation-owner'

// Copied from useFileDuplicate: strips Electron invoke error wrappers.
function extractIpcErrorMessage(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) {
    return fallback
  }
  const match = err.message.match(/Error invoking remote method '[^']*': (?:Error: )?(.+)/)
  return match ? match[1] : err.message
}

/** Appends to the full name, so the original extension stays: `a.sql` -> `a.sql_result.txt`, then `_result_2.txt`. */
export function resultCopyName(name: string, attempt: number): string {
  return attempt <= 1 ? `${name}_result.txt` : `${name}_result_${attempt}.txt`
}

const MAX_EEXIST_RETRIES = 10

type RefreshDir = (dirPath: string) => Promise<void>

/** Supplied by the explorer rows wrapper: the tree's own refresh, which watcher-ignored dirs depend on. */
export const DuplicateAsResultRefreshContext = createContext<RefreshDir | null>(null)

async function copyAsResult(
  node: TreeNode,
  activeWorktreeId: string,
  worktreePath: string,
  refreshDir: RefreshDir | null
) {
  const dir = dirname(node.path)
  const name = basename(node.path)
  let operationGuard
  try {
    operationGuard = captureFileExplorerOperationGuard(activeWorktreeId, node.operationOwner)
  } catch (err) {
    toast.error(extractIpcErrorMessage(err, `Failed to duplicate '${name}'.`))
    return
  }
  const context = {
    target: operationGuard.route.target,
    worktreeId: activeWorktreeId,
    worktreePath,
    connectionId: operationGuard.route.connectionId,
    expectedExecutionHostId: operationGuard.route.expectedExecutionHostId,
    expectedSshTargetId: operationGuard.route.expectedSshTargetId,
    expectedSshConnectionGeneration: operationGuard.route.expectedSshConnectionGeneration
  }
  let attempt = 1
  let candidateName = resultCopyName(name, attempt)
  try {
    while (await runtimePathExists(context, joinPath(dir, candidateName))) {
      attempt += 1
      candidateName = resultCopyName(name, attempt)
    }
  } catch (err) {
    toast.error(extractIpcErrorMessage(err, `Failed to duplicate '${name}'.`))
    return
  }

  // The exclusive copy rejects with EEXIST if another process claims the name after the exists check.
  let retries = 0
  while (true) {
    try {
      operationGuard.assertCurrent()
      await copyRuntimePath(context, node.path, joinPath(dir, candidateName))
      break
    } catch (err) {
      const isEexist =
        err instanceof Error &&
        (err.message.includes('EEXIST') || err.message.includes('already exists'))
      if (isEexist && retries < MAX_EEXIST_RETRIES) {
        attempt += 1
        candidateName = resultCopyName(name, attempt)
        retries += 1
        continue
      }
      toast.error(extractIpcErrorMessage(err, `Failed to duplicate '${name}'.`))
      return
    }
  }

  // Watcher-ignored dirs (dist, build, ...) never announce the new file; a refresh failure must not fail a done copy.
  // refreshDir is bound to the click-time workspace; a stale one would retag the new tree's source workspace.
  if (useAppStore.getState().activeWorktreeId === activeWorktreeId) {
    try {
      await refreshDir?.(dir)
    } catch {}
  }

  // relativePath ends with the file name, so the copy shares its parent.
  const relativeDir = node.relativePath.slice(0, node.relativePath.length - name.length)
  const runtimeEnvironmentId = runtimeTargetEnvironmentId(operationGuard.route.target)
  useAppStore.getState().openFile(
    {
      filePath: joinPath(dir, candidateName),
      relativePath: `${relativeDir}${candidateName}`,
      worktreeId: activeWorktreeId,
      runtimeEnvironmentId: runtimeEnvironmentId ?? undefined,
      language: detectLanguage(candidateName),
      mode: 'edit'
    },
    { suppressActiveRuntimeFallback: runtimeEnvironmentId === null }
  )
}

export function duplicateFileAsResult(node: TreeNode, refreshDir: RefreshDir | null = null): void {
  // Read at click time so the menu item renders without subscribing to the store.
  const { activeWorktreeId, activeWorkspaceExecutionHostId, getKnownWorktreeById } =
    useAppStore.getState()
  const worktreePath = activeWorktreeId
    ? getKnownWorktreeById(activeWorktreeId, activeWorkspaceExecutionHostId ?? undefined)?.path
    : null
  if (node.isDirectory || !worktreePath || !activeWorktreeId) {
    return
  }
  void copyAsResult(node, activeWorktreeId, worktreePath, refreshDir)
}

export function DuplicateAsResultItem({ node }: { node: TreeNode }): React.JSX.Element | null {
  const refreshDir = useContext(DuplicateAsResultRefreshContext)
  if (node.isDirectory) {
    return null
  }
  return (
    // Why: rows listed through an outside folder link are browse-only; main refuses their writes.
    <ContextMenuItem
      disabled={node.outsideProject === true}
      onSelect={() => duplicateFileAsResult(node, refreshDir)}
    >
      <FileOutput />
      {translate(
        'auto.components.right.sidebar.FileExplorerRow.duplicateAsResult',
        'Duplicate as _result.txt'
      )}
    </ContextMenuItem>
  )
}
