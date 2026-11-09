// @protected-copy: Paste & Restore overwrite and delete confirmation.
import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { translate } from '@/i18n/i18n'
import { useTranslate, type Translate } from '@/i18n/use-translate'
import { formatClipcodeBytes } from './clipcode-byte-size'
import type { ParsedEntry } from './clipcode-clipboard-format'
import { ClipcodeMiddleEllipsisPath } from './clipcode-middle-ellipsis-path'
import { defaultAdjustRestorePaths } from './clipcode-restore-base-default'
import {
  planClipcodeRestore,
  previewClipcodeRestore,
  type ClipcodeRestoreBaseSuggestion,
  type ClipcodeRestorePreview,
  type ClipcodeRestoreWrite,
  type ClipcodeTargetState
} from './clipcode-restore-plan'

export type PendingClipcodeRestore = {
  rootPath: string
  entries: readonly ParsedEntry[]
  suggestion: ClipcodeRestoreBaseSuggestion | undefined
  /** Existing state of every path either base choice can target. */
  states: ReadonlyMap<string, ClipcodeTargetState>
  /** Hex SHA-256 of existing targets a non-text entry may already match. */
  existingSha256?: ReadonlyMap<string, string>
  /** OS of the host that owns rootPath; absent or null when it is not known. */
  targetPlatform?: NodeJS.Platform | null
}

export type ConfirmedClipcodeRestore = { preview: ClipcodeRestorePreview; overwrite: boolean }

function skipReasonLabel(reason: ClipcodeRestorePreview['skipped'][number]['reason']): string {
  switch (reason) {
    case 'UNSAFE_PATH':
      return translate(
        'auto.components.right.sidebar.source.control.clipcode.clipcode.restore.preview.dialog.9bd78385ce',
        'unsafe path'
      )
    case 'PROTECTED_GIT':
      return translate(
        'auto.components.right.sidebar.source.control.clipcode.clipcode.restore.preview.dialog.ef509f9991',
        '.git is protected'
      )
    case 'SYMLINK_IN_PATH':
      return translate(
        'auto.components.right.sidebar.source.control.clipcode.clipcode.restore.preview.dialog.1f409f3dd6',
        'path goes through a symlink'
      )
    case 'OUTSIDE_ROOT':
      return translate(
        'auto.components.right.sidebar.source.control.clipcode.clipcode.restore.preview.dialog.85d6d805ca',
        'outside the folder'
      )
    case 'CONTENT_SKIPPED':
      return translate(
        'auto.components.right.sidebar.source.control.clipcode.clipcode.restore.preview.dialog.4acb11ed21',
        'content was skipped when copied'
      )
    case 'ALREADY_ABSENT':
      return translate(
        'auto.components.right.sidebar.source.control.clipcode.clipcode.restore.preview.dialog.67e63b0749',
        'already absent'
      )
    case 'IS_DIRECTORY':
      return translate(
        'auto.components.right.sidebar.source.control.clipcode.clipcode.restore.preview.dialog.becf17b643',
        'is a folder'
      )
    case 'PARENT_IS_FILE':
      return translate(
        'auto.components.right.sidebar.source.control.clipcode.clipcode.restore.preview.dialog.parentIsFile',
        'a parent folder is a file'
      )
    case 'TARGET_UNREADABLE':
      return translate(
        'auto.components.right.sidebar.source.control.clipcode.clipcode.restore.preview.dialog.targetUnreadable',
        'could not check the existing file'
      )
    case 'NON_UTF8_TARGET':
      return translate(
        'auto.components.right.sidebar.source.control.clipcode.clipcode.restore.preview.dialog.nonUtf8Target',
        'Existing file is not UTF-8; not overwritten'
      )
    case 'TARGET_COLLISION':
      return translate(
        'auto.components.right.sidebar.source.control.clipcode.clipcode.restore.preview.dialog.targetCollision',
        'Another entry writes the same file'
      )
    case 'CORRUPT_NON_TEXT':
      return translate(
        'auto.components.right.sidebar.source.control.clipcode.clipcode.restore.preview.dialog.corruptNonText',
        'Corrupt non-text file'
      )
  }
}

function nonTextNote(size: number, t: Translate): string {
  return t(
    'auto.components.right.sidebar.source.control.clipcode.clipcode.restore.preview.dialog.nonTextSize',
    'non-text file · {{value0}}',
    { value0: formatClipcodeBytes(size) }
  )
}

// Why: a non-text row shows its size, never the Base64 or a diff.
function writeRow(write: ClipcodeRestoreWrite, t: Translate): PathRow {
  return 'bytes' in write
    ? { path: write.relativePath, note: nonTextNote(write.bytes.length, t) }
    : { path: write.relativePath }
}

// Why: an identical target sits with the other existing files, marked instead of counted as an overwrite.
function unchangedRow(item: ClipcodeRestorePreview['unchanged'][number], t: Translate): PathRow {
  const badge = t(
    'auto.components.right.sidebar.source.control.clipcode.clipcode.restore.preview.dialog.unchanged',
    'Unchanged'
  )
  const note = nonTextNote(item.size, t)
  // Why detail: a long path pushes the badge out of view, so the tooltip still says Unchanged.
  return {
    path: item.relativePath,
    badge,
    badgeVariant: 'secondary',
    note,
    detail: `${badge} · ${note}`
  }
}

function skipRow(skipped: ClipcodeRestorePreview['skipped'][number], t: Translate): PathRow {
  return skipped.reason === 'CORRUPT_NON_TEXT'
    ? {
        path: skipped.path,
        badge: t(
          'auto.components.right.sidebar.source.control.clipcode.clipcode.restore.preview.dialog.corruptBadge',
          'Corrupt'
        ),
        detail: skipReasonLabel(skipped.reason)
      }
    : { path: skipped.path, reason: skipReasonLabel(skipped.reason) }
}

/** `note` shows in the row while it fits; `reason` always does; `detail` only in the tooltip. */
type PathRow = {
  path: string
  note?: string
  reason?: string
  detail?: string
  badge?: string
  badgeVariant?: 'destructive' | 'secondary'
}

function PathList({
  title,
  rows,
  count = rows.length
}: {
  title: string
  rows: readonly PathRow[]
  /** Rows that act; defaults to all of them. */
  count?: number
}): React.JSX.Element | null {
  if (rows.length === 0) {
    return null
  }
  return (
    <div className="min-w-0">
      <div className="text-xs font-medium text-foreground">
        {title} ({count})
      </div>
      <ul className="mt-0.5 space-y-1 text-2xs text-muted-foreground">
        {rows.map((row) => {
          const detail = row.detail ?? row.reason ?? row.note
          const title = detail ? `${row.path}\n${detail}` : row.path
          return (
            // Why one clipped line with a tall row gap: a badge or note that does not fit whole
            // wraps out of view instead of squeezing the name, which keeps priority and shortens last.
            <li
              key={row.path}
              title={title}
              className="flex h-6 min-w-0 flex-wrap content-start items-center gap-x-2 gap-y-10 overflow-hidden"
            >
              <ClipcodeMiddleEllipsisPath
                path={row.path}
                title={title}
                // Why flex-1 with a reason: a zero basis keeps the reason on the visible line; the path shortens instead.
                className={row.reason ? 'flex-1 font-mono' : 'flex-initial font-mono'}
              />
              {row.badge && (
                <Badge variant={row.badgeVariant ?? 'destructive'} className="flex-none">
                  {row.badge}
                </Badge>
              )}
              {(row.reason ?? row.note) && (
                <span className="flex-none whitespace-nowrap font-medium text-foreground">
                  {row.reason ?? row.note}
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function ClipcodeRestorePreviewDialog({
  pending,
  onCancel,
  onConfirm
}: {
  pending: PendingClipcodeRestore
  onCancel: () => void
  onConfirm: (confirmed: ConfirmedClipcodeRestore) => void
}): React.JSX.Element {
  const t = useTranslate()
  const [adjustPaths, setAdjustPaths] = useState(() => defaultAdjustRestorePaths(pending))
  const [overwrite, setOverwrite] = useState(false)
  const base = adjustPaths ? pending.suggestion?.base : undefined
  const preview = useMemo(() => {
    const plan = planClipcodeRestore({
      rootPath: pending.rootPath,
      entries: pending.entries,
      base,
      targetPlatform: pending.targetPlatform
    })
    return previewClipcodeRestore(
      plan,
      (path) => pending.states.get(path) ?? 'missing',
      (path) => pending.existingSha256?.get(path)
    )
  }, [base, pending])
  const actionable =
    preview.create.length + (overwrite ? preview.overwrite.length : 0) + preview.delete.length

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onCancel()
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t(
              'auto.components.right.sidebar.source.control.clipcode.clipcode.restore.preview.dialog.2c06a4e179',
              'Paste & Restore'
            )}
          </DialogTitle>
          <DialogDescription>
            {t(
              'auto.components.right.sidebar.source.control.clipcode.clipcode.restore.preview.dialog.87832cd30d',
              'Files from the clipboard will be written into this folder.'
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-w-0 flex-col gap-3">
          {pending.suggestion && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="clipcode-adjust-paths"
                checked={adjustPaths}
                onCheckedChange={(checked) => setAdjustPaths(checked === true)}
              />
              <Label htmlFor="clipcode-adjust-paths">
                {t(
                  'auto.components.right.sidebar.source.control.clipcode.clipcode.restore.preview.dialog.813199296f',
                  'Adjust paths ({{value0}})',
                  {
                    value0: pending.suggestion.label
                  }
                )}
              </Label>
            </div>
          )}
          <div className="flex max-h-64 flex-col gap-2 overflow-y-auto scrollbar-sleek">
            <PathList
              title={t(
                'auto.components.right.sidebar.source.control.clipcode.clipcode.restore.preview.dialog.9a421f14d8',
                'Create'
              )}
              rows={preview.create.map((write) => writeRow(write, t))}
            />
            <PathList
              title={t(
                'auto.components.right.sidebar.source.control.clipcode.clipcode.restore.preview.dialog.d469ff3b81',
                'Overwrite'
              )}
              rows={[
                ...preview.overwrite.map((write) => writeRow(write, t)),
                ...preview.unchanged.map((item) => unchangedRow(item, t))
              ]}
              count={preview.overwrite.length}
            />
            <PathList
              title={t(
                'auto.components.right.sidebar.source.control.clipcode.clipcode.restore.preview.dialog.9cf3526c1f',
                'Delete'
              )}
              rows={preview.delete.map((item) => ({ path: item.relativePath }))}
            />
            <PathList
              title={t(
                'auto.components.right.sidebar.source.control.clipcode.clipcode.restore.preview.dialog.0d87b3b39d',
                'Skip'
              )}
              rows={preview.skipped.map((skipped) => skipRow(skipped, t))}
            />
          </div>
          {preview.overwrite.length > 0 && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="clipcode-overwrite-existing"
                checked={overwrite}
                onCheckedChange={(checked) => setOverwrite(checked === true)}
              />
              <Label htmlFor="clipcode-overwrite-existing">
                {t(
                  'auto.components.right.sidebar.source.control.clipcode.clipcode.restore.preview.dialog.overwriteAll',
                  'Overwrite all {{count}} existing files',
                  {
                    count: preview.overwrite.length,
                    defaultValue_one: 'Overwrite {{count}} existing file'
                  }
                )}
              </Label>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            {t(
              'auto.components.right.sidebar.source.control.clipcode.clipcode.restore.preview.dialog.677bf0ade9',
              'Cancel'
            )}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={actionable === 0}
            onClick={() => onConfirm({ preview, overwrite })}
          >
            {t(
              'auto.components.right.sidebar.source.control.clipcode.clipcode.restore.preview.dialog.c0b1b53e49',
              'Restore'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
