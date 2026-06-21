import { getActiveRuntimeTarget, callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { readRuntimeDirectory, type RuntimeFileOperationArgs } from '@/runtime/runtime-file-client'
import { toRuntimeWorktreeSelector } from '@/runtime/runtime-worktree-selector'
import { joinRuntimePasteImagesDir } from './terminal-drop-worktree-path'

const GITIGNORE_RELATIVE = '.orca/.gitignore'
// Why: keep all Orca-written paste images out of git history; the no-clobber
// write throws once the marker already exists, which we treat as success.
const GITIGNORE_CONTENT_BASE64 = btoa('*\n!.gitignore\n')
const DEFAULT_KEEP = 20

export async function ensureRuntimePasteImagesGitignore(
  ctx: RuntimeFileOperationArgs,
  worktreeId: string
): Promise<void> {
  const target = getActiveRuntimeTarget(ctx.settings)
  if (target.kind !== 'environment') {
    return
  }
  try {
    await callRuntimeRpc(
      target,
      'files.writeBase64',
      {
        worktree: toRuntimeWorktreeSelector(worktreeId),
        relativePath: GITIGNORE_RELATIVE,
        contentBase64: GITIGNORE_CONTENT_BASE64
      },
      { timeoutMs: 15_000 }
    )
  } catch {
    // already exists or transient — non-fatal for the paste flow.
  }
}

function parsePasteTimestamp(name: string): number {
  const match = /^orca-paste-(\d+)-/.exec(name)
  return match ? Number(match[1]) : 0
}

export async function pruneRuntimePasteImages(
  ctx: RuntimeFileOperationArgs,
  worktreeId: string,
  worktreePath: string,
  opts?: { keep?: number }
): Promise<void> {
  const target = getActiveRuntimeTarget(ctx.settings)
  if (target.kind !== 'environment') {
    return
  }
  const keep = opts?.keep ?? DEFAULT_KEEP
  try {
    const entries = await readRuntimeDirectory(ctx, joinRuntimePasteImagesDir(worktreePath))
    const stale = entries
      .map((entry) => entry.name)
      .filter((name) => name.startsWith('orca-paste-'))
      .sort((a, b) => parsePasteTimestamp(b) - parsePasteTimestamp(a))
      .slice(keep)
    await Promise.all(
      stale.map((name) =>
        Promise.resolve(
          callRuntimeRpc(
            target,
            'files.delete',
            {
              worktree: toRuntimeWorktreeSelector(worktreeId),
              relativePath: `.orca/paste-images/${name}`
            },
            { timeoutMs: 15_000 }
          )
        ).catch(() => {})
      )
    )
  } catch {
    // listing failed (dir missing, transient) — pruning is best-effort.
  }
}
