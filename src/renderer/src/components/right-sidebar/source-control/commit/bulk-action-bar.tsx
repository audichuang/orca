import { Plus, Minus, X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { toastBottomClearanceRef } from '@/lib/toast-bottom-clearance'
import { ClipcodeBulkCopyButton } from '../clipcode/clipcode-menu-items'

export function BulkActionBar({
  selectedCount,
  stageableCount,
  unstageableCount,
  onStage,
  onUnstage,
  onClear,
  isExecuting
}: {
  selectedCount: number
  stageableCount: number
  unstageableCount: number
  onStage: () => void
  onUnstage: () => void
  onClear: () => void
  isExecuting: boolean
}) {
  return (
    // Why: pr-12 keeps the floating workspace button (default bottom-right spot) off the actions.
    <div
      ref={toastBottomClearanceRef}
      className="absolute bottom-0 left-0 right-0 p-2 pr-12 bg-background border-t border-border shadow-lg animate-in slide-in-from-bottom-2 z-10"
    >
      <div className="flex items-center gap-2 justify-between bg-accent/30 p-1.5 pr-2 rounded-md border border-border/50">
        <div className="flex shrink-0 items-center gap-2 whitespace-nowrap text-xs font-medium text-foreground ml-1">
          {isExecuting ? (
            <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
          ) : (
            <span className="tabular-nums">
              {selectedCount}{' '}
              {translate('auto.components.right.sidebar.BulkActionBar.60ed678138', 'selected')}
            </span>
          )}
        </div>
        <div className="flex min-w-0 items-center justify-end gap-1.5">
          {stageableCount > 0 && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-7 px-2 text-[11px]"
              onClick={onStage}
              disabled={isExecuting}
            >
              <Plus className="mr-1 size-3" />
              {translate('auto.components.right.sidebar.BulkActionBar.ef5f5bd06e', 'Stage (')}
              {stageableCount})
            </Button>
          )}
          {unstageableCount > 0 && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-7 px-2 text-[11px]"
              onClick={onUnstage}
              disabled={isExecuting}
            >
              <Minus className="mr-1 size-3" />
              {translate('auto.components.right.sidebar.BulkActionBar.79a9f5f712', 'Unstage (')}
              {unstageableCount})
            </Button>
          )}
          <ClipcodeBulkCopyButton disabled={isExecuting} />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            onClick={onClear}
            aria-label={translate(
              'auto.components.right.sidebar.source.control.commit.bulk.action.bar.4139bc5679',
              'Clear selection'
            )}
            disabled={isExecuting}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}
