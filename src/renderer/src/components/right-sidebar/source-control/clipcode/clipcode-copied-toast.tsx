import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import {
  CLIPCODE_TOKEN_DANGER_THRESHOLD,
  CLIPCODE_TOKEN_WARN_THRESHOLD,
  formatClipcodeCount,
  payloadStats,
  type ClipcodePayloadStats
} from './clipcode-payload-stats'

// Why: the clipboard holds only the latest copy, and stacked copy toasts cover the rows copied next.
// A fresh id (not an update in place) so the new toast still shows if the old one is mid-exit.
let shownCopiedToastId: string | number | undefined

function ClipcodeCopiedBody({
  stats,
  limit,
  notes
}: {
  stats: ClipcodePayloadStats
  limit: number | null
  notes: readonly string[]
}): React.JSX.Element {
  return (
    <div className="flex min-w-0 flex-col gap-1 tabular-nums">
      {limit !== null && (
        <p className="font-medium text-popover-foreground">
          {translate(
            'auto.components.right.sidebar.source.control.clipcode.clipcode.copy.action.e6cdc3a753',
            'Over {{value0}} tokens.',
            { value0: formatClipcodeCount(limit) }
          )}
        </p>
      )}
      <p className="text-popover-foreground/80">
        {/* Why: tokens decide whether the paste fits a model, so they lead and the rest is detail. */}
        <span className="font-medium text-popover-foreground">
          {translate(
            'auto.components.right.sidebar.source.control.clipcode.clipcode.copy.action.tokenCount',
            '~{{value0}} tokens',
            { value0: formatClipcodeCount(stats.tokens) }
          )}
        </span>
        <span className="text-xs">
          {' · '}
          {translate(
            'auto.components.right.sidebar.source.control.clipcode.clipcode.copy.action.payloadDetails',
            '{{lines}} lines · {{chars}} chars · {{words}} words',
            {
              lines: formatClipcodeCount(stats.lines),
              chars: formatClipcodeCount(stats.chars),
              words: formatClipcodeCount(stats.words)
            }
          )}
        </span>
      </p>
      {notes.length > 0 && <p className="text-xs text-popover-foreground/80">{notes.join(' ')}</p>}
    </div>
  )
}

/** Reports a Copy Full Source: what was copied as the title, payload size and skips below it. */
export function notifyClipcodeCopied(
  title: string,
  notes: readonly string[],
  payload: string
): void {
  const stats = payloadStats(payload)
  const [show, limit] =
    stats.tokens >= CLIPCODE_TOKEN_DANGER_THRESHOLD
      ? [toast.error, CLIPCODE_TOKEN_DANGER_THRESHOLD]
      : stats.tokens >= CLIPCODE_TOKEN_WARN_THRESHOLD
        ? [toast.warning, CLIPCODE_TOKEN_WARN_THRESHOLD]
        : [toast.success, null]
  if (shownCopiedToastId !== undefined) {
    toast.dismiss(shownCopiedToastId)
  }
  shownCopiedToastId = show(title, {
    description: <ClipcodeCopiedBody stats={stats} limit={limit} notes={notes} />,
    // Why: an oversized payload stays up until dismissed so the warning cannot be missed.
    duration: limit === null ? 4000 : Infinity
  })
}
