import { useMemo, useState } from 'react'
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
import type { ParsedEntry } from './clipcode-clipboard-format'
import { defaultAdjustRestorePaths } from './clipcode-restore-base-default'
import {
  planClipcodeRestore,
  previewClipcodeRestore,
  type ClipcodeRestoreBaseSuggestion,
  type ClipcodeRestorePreview,
  type ClipcodeTargetState
} from './clipcode-restore-plan'

export type PendingClipcodeRestore = {
  rootPath: string
  entries: readonly ParsedEntry[]
  suggestion: ClipcodeRestoreBaseSuggestion | undefined
  /** Existing state of every path either base choice can target. */
  states: ReadonlyMap<string, ClipcodeTargetState>
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
    case 'CASE_CONFLICT':
      return translate(
        'auto.components.right.sidebar.source.control.clipcode.clipcode.restore.preview.dialog.caseConflict',
        'same path with different letter case'
      )
  }
}

function PathList({
  title,
  paths,
  notes
}: {
  title: string
  paths: readonly string[]
  notes?: readonly string[]
}): React.JSX.Element | null {
  if (paths.length === 0) {
    return null
  }
  return (
    <div className="min-w-0">
      <div className="text-xs font-medium text-foreground">
        {title} ({paths.length})
      </div>
      <ul className="mt-0.5 space-y-1 text-[11px] text-muted-foreground">
        {paths.map((path, index) => (
          <li key={path} title={path}>
            {/* Why: the reason leads on its own line so long absolute paths can wrap without hiding it. */}
            {notes?.[index] ? (
              <div className="font-medium text-foreground">{notes[index]}</div>
            ) : null}
            <div className="break-all font-mono">{path}</div>
          </li>
        ))}
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
  const [adjustPaths, setAdjustPaths] = useState(() => defaultAdjustRestorePaths(pending))
  const [overwrite, setOverwrite] = useState(false)
  const base = adjustPaths ? pending.suggestion?.base : undefined
  const preview = useMemo(() => {
    const plan = planClipcodeRestore({ rootPath: pending.rootPath, entries: pending.entries, base })
    return previewClipcodeRestore(plan, (path) => pending.states.get(path) ?? 'missing')
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
            {translate(
              'auto.components.right.sidebar.source.control.clipcode.clipcode.restore.preview.dialog.2c06a4e179',
              'Paste & Restore'
            )}
          </DialogTitle>
          <DialogDescription>
            {translate(
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
                {translate(
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
              title={translate(
                'auto.components.right.sidebar.source.control.clipcode.clipcode.restore.preview.dialog.9a421f14d8',
                'Create'
              )}
              paths={preview.create.map((item) => item.relativePath)}
            />
            <PathList
              title={translate(
                'auto.components.right.sidebar.source.control.clipcode.clipcode.restore.preview.dialog.d469ff3b81',
                'Overwrite'
              )}
              paths={preview.overwrite.map((item) => item.relativePath)}
            />
            <PathList
              title={translate(
                'auto.components.right.sidebar.source.control.clipcode.clipcode.restore.preview.dialog.9cf3526c1f',
                'Delete'
              )}
              paths={preview.delete.map((item) => item.relativePath)}
            />
            <PathList
              title={translate(
                'auto.components.right.sidebar.source.control.clipcode.clipcode.restore.preview.dialog.0d87b3b39d',
                'Skip'
              )}
              paths={preview.skipped.map((item) => item.path)}
              notes={preview.skipped.map((item) => skipReasonLabel(item.reason))}
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
                {translate(
                  'auto.components.right.sidebar.source.control.clipcode.clipcode.restore.preview.dialog.80224f9095',
                  'Overwrite existing files'
                )}
              </Label>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            {translate(
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
            {translate(
              'auto.components.right.sidebar.source.control.clipcode.clipcode.restore.preview.dialog.c0b1b53e49',
              'Restore'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
