import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type { DiffDirection } from './diff-change-boundary'
import type { DiffFilePosition } from './diff-file-sequence'

const HINT_TEXT: Record<DiffDirection, () => string> = {
  next: () =>
    translate(
      'auto.components.editor.DiffFileSequenceStatus.pressAgainNext',
      'Press again to go to the next file'
    ),
  previous: () =>
    translate(
      'auto.components.editor.DiffFileSequenceStatus.pressAgainPrevious',
      'Press again to go to the previous file'
    )
}

/** "3/6 files" beside the change arrows, swapped for the press-again hint while a file boundary is armed. */
export function DiffFileSequenceStatus({
  position,
  hint
}: {
  position: Pick<DiffFilePosition, 'index' | 'total'>
  hint: DiffDirection | null
}): React.JSX.Element {
  const text = hint
    ? HINT_TEXT[hint]()
    : translate(
        'auto.components.editor.DiffFileSequenceStatus.position',
        '{{index}}/{{total}} files',
        {
          index: position.index + 1,
          total: position.total
        }
      )
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        'min-w-0 truncate px-1 text-2xs tabular-nums',
        hint ? 'rounded bg-accent text-foreground' : 'text-muted-foreground'
      )}
    >
      {text}
    </span>
  )
}
