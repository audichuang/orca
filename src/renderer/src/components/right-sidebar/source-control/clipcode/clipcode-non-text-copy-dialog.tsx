// Fork-only: the ClipCode copy question for non-text files (Include / Exclude / Cancel), asked before the clipboard write.
import { useRef, useSyncExternalStore } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { useTranslate } from '@/i18n/use-translate'
import { formatBytes } from '../../../../../../shared/format-bytes'
import {
  CLIPCODE_PAYLOAD_LIMIT_BYTES,
  CLIPCODE_READ_MAX_BYTES,
  type ClipcodeNonTextSummary
} from './clipcode-entry-content'
import { ClipcodeMiddleEllipsisPath } from './clipcode-middle-ellipsis-path'

export type ClipcodeNonTextChoice = 'include' | 'exclude' | 'cancel'

const MAX_LISTED = 10

type Pending = { summary: ClipcodeNonTextSummary; resolve: (choice: ClipcodeNonTextChoice) => void }

let pending: Pending | null = null
const listeners = new Set<() => void>()

function setPending(next: Pending | null): void {
  pending = next
  for (const listener of listeners) {
    listener()
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Opens the dialog and resolves with the button pressed; closing it (Esc) cancels. Not remembered. */
export function askClipcodeNonTextChoice(
  summary: ClipcodeNonTextSummary
): Promise<ClipcodeNonTextChoice> {
  // Why: a newer copy replaces an unanswered question; the older copy then writes nothing.
  pending?.resolve('cancel')
  return new Promise((resolve) => setPending({ summary, resolve }))
}

function choose(choice: ClipcodeNonTextChoice): void {
  const current = pending
  setPending(null)
  current?.resolve(choice)
}

/** Root-hosted so every copy entry point (source control, file explorer) shares one dialog. */
export function ClipcodeNonTextCopyDialogHost(): React.JSX.Element | null {
  const current = useSyncExternalStore(subscribe, () => pending)
  return current ? <ClipcodeNonTextCopyDialog summary={current.summary} /> : null
}

function ClipcodeNonTextCopyDialog({
  summary
}: {
  summary: ClipcodeNonTextSummary
}): React.JSX.Element {
  const t = useTranslate()
  const includeRef = useRef<HTMLButtonElement>(null)
  const excludeRef = useRef<HTMLButtonElement>(null)
  const overLimit = summary.includePayloadBytes > CLIPCODE_PAYLOAD_LIMIT_BYTES
  const shown = summary.files.slice(0, MAX_LISTED)
  const more = summary.count - shown.length
  return (
    <Dialog open onOpenChange={(open) => !open && choose('cancel')}>
      <DialogContent
        className="max-w-md"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          ;(overLimit ? excludeRef : includeRef).current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {t(
              'auto.components.right.sidebar.source.control.clipcode.clipcode.non.text.copy.dialog.title',
              'Copy non-text files?'
            )}
          </DialogTitle>
          <DialogDescription>
            {t(
              'auto.components.right.sidebar.source.control.clipcode.clipcode.non.text.copy.dialog.description',
              'Include copies them as Base64; Exclude leaves them out.'
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="min-w-0 space-y-1.5 text-xs tabular-nums">
          <div className="font-medium text-foreground">
            {t(
              'auto.components.right.sidebar.source.control.clipcode.clipcode.non.text.copy.dialog.found',
              'Non-text files: {{value0}}, {{value1}} in total',
              { value0: summary.count, value1: formatBytes(summary.totalBytes) }
            )}
          </div>
          <div className="text-muted-foreground">
            {overLimit
              ? t(
                  'auto.components.right.sidebar.source.control.clipcode.clipcode.non.text.copy.dialog.overLimit',
                  'Clipboard size with them: more than {{value0}}',
                  { value0: `${CLIPCODE_PAYLOAD_LIMIT_BYTES / 1024 / 1024} MiB` }
                )
              : t(
                  'auto.components.right.sidebar.source.control.clipcode.clipcode.non.text.copy.dialog.estimate',
                  'Clipboard size with them: about {{value0}}',
                  { value0: formatBytes(summary.includePayloadBytes) }
                )}
          </div>
          {overLimit && (
            <div className="text-destructive" role="alert">
              {t(
                'auto.components.right.sidebar.source.control.clipcode.clipcode.non.text.copy.dialog.overLimitReason',
                'Too large for the clipboard, so Include is not available.'
              )}
            </div>
          )}
          <ul className="space-y-0.5 text-2xs text-muted-foreground">
            {shown.map((file) => (
              <li key={file.path} className="flex min-w-0 items-baseline gap-2">
                <ClipcodeMiddleEllipsisPath path={file.path} className="font-mono" />
                <span className="shrink-0 whitespace-nowrap">{formatBytes(file.size)}</span>
              </li>
            ))}
          </ul>
          {more > 0 && (
            <div className="text-muted-foreground">
              {t(
                'auto.components.right.sidebar.source.control.clipcode.clipcode.non.text.copy.dialog.more',
                'and {{value0}} more',
                { value0: more }
              )}
            </div>
          )}
          {summary.unreadOverLimitCount > 0 && (
            <div className="text-muted-foreground">
              {t(
                'auto.components.right.sidebar.source.control.clipcode.clipcode.non.text.copy.dialog.notRead',
                'Not read, over {{value0}} (copied as size placeholders): {{value1}}',
                {
                  value0: formatBytes(CLIPCODE_READ_MAX_BYTES),
                  value1: summary.unreadOverLimitCount
                }
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => choose('cancel')}>
            {t(
              'auto.components.right.sidebar.source.control.clipcode.clipcode.non.text.copy.dialog.cancel',
              'Cancel'
            )}
          </Button>
          <Button ref={excludeRef} variant="outline" onClick={() => choose('exclude')}>
            {t(
              'auto.components.right.sidebar.source.control.clipcode.clipcode.non.text.copy.dialog.exclude',
              'Exclude'
            )}
          </Button>
          <Button ref={includeRef} disabled={overLimit} onClick={() => choose('include')}>
            {t(
              'auto.components.right.sidebar.source.control.clipcode.clipcode.non.text.copy.dialog.include',
              'Include'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
