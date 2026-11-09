import { toast } from 'sonner'
import { useTranslate } from '@/i18n/use-translate'
import {
  CLIPCODE_TOKEN_DANGER_THRESHOLD,
  CLIPCODE_TOKEN_WARN_THRESHOLD,
  formatClipcodeCount,
  payloadStats,
  type ClipcodePayloadStats
} from './clipcode-payload-stats'
import type { ClipcodeGitCopyResult } from './clipcode-git-copy'

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
  const t = useTranslate()
  return (
    <div className="flex min-w-0 flex-col gap-1 tabular-nums">
      {limit !== null && (
        <p className="font-medium text-popover-foreground">
          {t(
            'auto.components.right.sidebar.source.control.clipcode.clipcode.copy.action.e6cdc3a753',
            'Over {{value0}} tokens.',
            { value0: formatClipcodeCount(limit) }
          )}
        </p>
      )}
      <p className="text-popover-foreground/80">
        {/* Why: tokens decide whether the paste fits a model, so they lead and the rest is detail. */}
        <span className="font-medium text-popover-foreground">
          {t(
            'auto.components.right.sidebar.source.control.clipcode.clipcode.copy.action.tokenCount',
            '~{{value0}} tokens',
            { value0: formatClipcodeCount(stats.tokens) }
          )}
        </span>
        <span className="text-xs">
          {' · '}
          {t(
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
      {/* Why one line each: categories (non-text, unreadable, symlinked folder, ...) must not run together. */}
      {notes.map((note) => (
        <p key={note} className="text-xs text-popover-foreground/80">
          {note}
        </p>
      ))}
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

const NAMED_PATHS = 3

// Why: a skipped name may hold a tab or newline; show it rather than break the notice line.
function visiblePath(path: string): string {
  // oxlint-disable-next-line no-control-regex -- control characters are exactly what is made visible.
  return path.replace(/[\u0000-\u001f]/g, (char) =>
    char === '\t' ? '\\t' : `\\x${char.charCodeAt(0).toString(16).padStart(2, '0')}`
  )
}

/** "Unreadable: 2 · a.txt, b/c.txt": one notice line per category, naming the first few paths. */
function categoryLine(label: string, paths: readonly string[] | undefined): string {
  const named = paths?.slice(0, NAMED_PATHS) ?? []
  if (named.length === 0) {
    return label
  }
  const more = (paths?.length ?? 0) > named.length ? ', …' : ''
  return `${label} · ${named.map(visiblePath).join(', ')}${more}`
}

/** The notice lines under a copy's title: what Include carried, then each skip category on its own line. */
export function clipcodeCopyNotes(result: ClipcodeGitCopyResult): string[] {
  const notes: string[] = []
  if (result.nonTextFileCount) {
    notes.push(
      translate(
        'auto.components.right.sidebar.source.control.clipcode.clipcode.copy.action.nonTextCopied',
        'Non-text files copied as Base64: {{value0}}.',
        { value0: result.nonTextFileCount }
      )
    )
  }
  if (result.skippedFileSizeCount > 0) {
    notes.push(
      translate(
        'auto.components.right.sidebar.source.control.clipcode.clipcode.copy.action.7828c565da',
        '({{value0}} skipped: size exceeded)',
        { value0: result.skippedFileSizeCount }
      )
    )
  }
  if (result.skippedBinaryFileCount > 0) {
    notes.push(
      translate(
        'auto.components.right.sidebar.source.control.clipcode.clipcode.copy.action.nonTextSkipped',
        '({{value0}} skipped: non-text file)',
        { value0: result.skippedBinaryFileCount }
      )
    )
  }
  if (result.unreadableFileCount > 0) {
    notes.push(
      categoryLine(
        translate(
          'auto.components.right.sidebar.source.control.clipcode.clipcode.copy.action.unreadableLine',
          'Unreadable: {{value0}}',
          { value0: result.unreadableFileCount }
        ),
        result.unreadablePaths
      )
    )
  }
  const symlinkedFolders = result.symlinkedFolderPaths ?? []
  if (symlinkedFolders.length > 0) {
    notes.push(
      categoryLine(
        translate(
          'auto.components.right.sidebar.source.control.clipcode.clipcode.copy.action.symlinkedFolderLine',
          'Symlinked folder: {{value0}}',
          { value0: symlinkedFolders.length }
        ),
        symlinkedFolders
      )
    )
  }
  if (result.skippedUnsafePathCount > 0) {
    notes.push(
      categoryLine(
        translate(
          'auto.components.right.sidebar.source.control.clipcode.clipcode.copy.action.unsafeNameLine',
          'Name not portable: {{value0}}',
          { value0: result.skippedUnsafePathCount }
        ),
        result.unsafePaths
      )
    )
  }
  return notes
}
