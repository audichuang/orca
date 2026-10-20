import { Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { ImeInput } from '@/lib/ime-text-field'

/** Type-to-filter box above a folder workspace's repo headers. */
export function FolderRepoFilterBox({
  value,
  onChange,
  noMatch,
  onFocusFirst,
  onOpenFirst
}: {
  value: string
  onChange: (value: string) => void
  noMatch: boolean
  onFocusFirst: () => void
  onOpenFirst: () => void
}) {
  const label = translate(
    'auto.components.right.sidebar.source.control.folder.folder.multi.repo.panel.filterRepos',
    'Filter repositories'
  )
  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape' && value) {
      event.preventDefault()
      event.stopPropagation()
      onChange('')
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      onFocusFirst()
    } else if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
      event.preventDefault()
      onOpenFirst()
    }
  }
  return (
    <div className="shrink-0 border-b border-border px-2 py-1.5">
      <div className="flex h-7 items-center gap-1 rounded-sm border border-border bg-input/50 pl-1.5 focus-within:border-ring">
        <Search className="size-3.5 shrink-0 text-muted-foreground" />
        <ImeInput
          type="text"
          className="min-w-0 flex-1 bg-transparent py-1 text-xs text-foreground outline-none placeholder:text-muted-foreground/50"
          aria-label={label}
          placeholder={label}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          spellCheck={false}
        />
        {value ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={translate(
              'auto.components.right.sidebar.source.control.folder.folder.multi.repo.panel.clearFilter',
              'Clear filter'
            )}
            onClick={() => onChange('')}
          >
            <X />
          </Button>
        ) : null}
      </div>
      {noMatch && (
        <div className="px-1 pt-1.5 text-xs text-muted-foreground">
          {translate(
            'auto.components.right.sidebar.source.control.folder.folder.multi.repo.panel.filterNoMatch',
            'No repositories match'
          )}
        </div>
      )}
    </div>
  )
}
