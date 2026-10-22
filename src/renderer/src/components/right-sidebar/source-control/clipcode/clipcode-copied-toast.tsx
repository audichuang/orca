import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import {
  CLIPCODE_TOKEN_DANGER_THRESHOLD,
  CLIPCODE_TOKEN_WARN_THRESHOLD,
  formatClipcodeCount,
  payloadStats,
  type ClipcodePayloadStats
} from './clipcode-payload-stats'

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
          ~{formatClipcodeCount(stats.tokens)} tokens
        </span>
        <span className="text-xs">
          {` · ${formatClipcodeCount(stats.lines)} lines · ${formatClipcodeCount(stats.chars)} chars · ${formatClipcodeCount(stats.words)} words`}
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
  const limit =
    stats.tokens >= CLIPCODE_TOKEN_DANGER_THRESHOLD
      ? CLIPCODE_TOKEN_DANGER_THRESHOLD
      : stats.tokens >= CLIPCODE_TOKEN_WARN_THRESHOLD
        ? CLIPCODE_TOKEN_WARN_THRESHOLD
        : null
  const description = <ClipcodeCopiedBody stats={stats} limit={limit} notes={notes} />
  if (limit === CLIPCODE_TOKEN_DANGER_THRESHOLD) {
    toast.error(title, { description, duration: Infinity })
  } else if (limit !== null) {
    toast.warning(title, { description, duration: Infinity })
  } else {
    toast.success(title, { description, duration: 4000 })
  }
}
