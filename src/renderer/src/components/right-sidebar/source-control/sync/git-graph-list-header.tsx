// Fork-only: the Git Graph list's column header and its display menu (button or right-click).
import React, { useState } from 'react'
import { Columns3 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'
import { type GitGraphColumns, gitGraphGridTemplate } from './git-graph-full-row'
import {
  type GitGraphListPrefs,
  resetGitGraphListPrefs,
  setGitGraphListPrefs
} from './git-graph-list-prefs'

function messageLabel(): string {
  return translate('auto.components.right.sidebar.GitGraphFullView.message', 'Message')
}
function authorLabel(): string {
  return translate('auto.components.right.sidebar.GitGraphFullView.author', 'Author')
}
function dateLabel(): string {
  return translate('auto.components.right.sidebar.GitGraphFullView.date', 'Date')
}
function hashLabel(): string {
  return translate('auto.components.right.sidebar.GitGraphFullView.commit', 'Commit')
}

function GitGraphListMenu({
  prefs,
  shown,
  open,
  onOpenChange
}: {
  prefs: GitGraphListPrefs
  /** The columns actually on screen; a chosen one can still be dropped for want of width. */
  shown: GitGraphColumns
  open: boolean
  onOpenChange: (open: boolean) => void
}): React.JSX.Element {
  const label = translate(
    'auto.components.right.sidebar.GitGraphFullView.listOptions',
    'List options'
  )
  // Why keep the menu open on a toggle: several columns are usually changed in one go.
  const keepOpen = (event: Event): void => event.preventDefault()
  const columnItem = (key: 'author' | 'date' | 'hash', text: string): React.JSX.Element => (
    <DropdownMenuCheckboxItem
      checked={prefs[key]}
      onSelect={keepOpen}
      onCheckedChange={(checked) => setGitGraphListPrefs({ [key]: checked })}
    >
      {text}
      {prefs[key] && !prefs.twoLine && !shown[key] && (
        <span className="ml-auto pl-3 text-2xs text-muted-foreground">
          {translate(
            'auto.components.right.sidebar.GitGraphFullView.columnTooNarrow',
            'List too narrow'
          )}
        </span>
      )}
    </DropdownMenuCheckboxItem>
  )
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="absolute top-1/2 right-1 size-5 -translate-y-1/2"
          aria-label={label}
          title={label}
        >
          <Columns3 className="size-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>
          {translate('auto.components.right.sidebar.GitGraphFullView.columns', 'Columns')}
        </DropdownMenuLabel>
        {columnItem('author', authorLabel())}
        {columnItem('date', dateLabel())}
        {columnItem('hash', hashLabel())}
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={prefs.twoLine}
          onSelect={keepOpen}
          onCheckedChange={(checked) => setGitGraphListPrefs({ twoLine: checked })}
        >
          {translate('auto.components.right.sidebar.GitGraphFullView.twoLineRows', 'Two-line rows')}
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={resetGitGraphListPrefs}>
          {translate(
            'auto.components.right.sidebar.GitGraphFullView.resetList',
            'Reset to defaults'
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function GitGraphListHeader({
  columns,
  graphWidth,
  prefs
}: {
  columns: GitGraphColumns
  graphWidth: number
  prefs: GitGraphListPrefs
}): React.JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <div
      className="relative shrink-0"
      // Why: right-clicking a column title is where people look for column choices.
      onContextMenu={(event) => {
        event.preventDefault()
        setMenuOpen(true)
      }}
    >
      {/* Why both reserve the gutter: the header must lose the same scrollbar width as the rows. */}
      <div
        data-git-graph-header=""
        className="scrollbar-sleek grid items-center gap-x-3 overflow-hidden border-b border-border px-3 py-1 text-2xs text-muted-foreground [scrollbar-gutter:stable]"
        style={{ gridTemplateColumns: gitGraphGridTemplate(columns) }}
      >
        <span data-col="graph" style={{ width: graphWidth }} />
        <span data-col="message">{messageLabel()}</span>
        {columns.author && <span data-col="author">{authorLabel()}</span>}
        {columns.date && <span data-col="date">{dateLabel()}</span>}
        {columns.hash && <span data-col="hash">{hashLabel()}</span>}
      </div>
      <GitGraphListMenu prefs={prefs} shown={columns} open={menuOpen} onOpenChange={setMenuOpen} />
    </div>
  )
}
