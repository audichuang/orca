// Fork-only: IntelliJ-style User / Paths filter buttons for the full Git Graph toolbar.
import React, { useMemo, useState } from 'react'
import { Check, ChevronDown, FileSearch, User, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { GitHistoryItem } from '../../../../../../shared/git-history'
import {
  isGitHistoryGraphFiltered,
  useGitHistoryGraphDraftQuery,
  useGitHistoryGraphFilter
} from './git-history-graph-filter'
import {
  applyGitHistoryGraphQuery,
  collectGitHistoryAuthors,
  listRecentGitHistoryGraphPaths,
  readGitHistoryGraphQueryToken,
  rememberGitHistoryGraphPath,
  resetGitHistoryGraphFilterToDefault,
  setGitHistoryGraphQueryToken,
  type GitHistoryGraphQueryTokenKey
} from './git-history-graph-query-tokens'

/** Last path segment, so a long repo path still fits the button. */
function shortPath(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, '')
  const cut = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  return cut < 0 ? path : `…/${path.slice(cut + 1)}`
}

function FilterButton({
  icon,
  label,
  value,
  shownValue,
  clearLabel,
  open,
  onOpenChange,
  onClear,
  children
}: {
  icon: React.ReactNode
  label: string
  value: string | null
  shownValue: string | null
  clearLabel: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onClear: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <ButtonGroup className="min-w-0 max-w-48">
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="xs"
            role="combobox"
            aria-expanded={open}
            aria-label={label}
            title={value ?? undefined}
            className="min-w-0 justify-between"
          >
            {icon}
            {/* Why whitespace-pre: paths are matched literally, so repeated spaces must show. */}
            <span className="overflow-hidden text-ellipsis whitespace-pre">
              {shownValue ? `${label}: ${shownValue}` : label}
            </span>
            <ChevronDown className="size-3 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(300px,calc(100vw-1rem))]">
          {children}
        </PopoverContent>
      </Popover>
      {value && (
        <Button
          type="button"
          variant="outline"
          size="icon-xs"
          aria-label={clearLabel}
          title={clearLabel}
          onClick={onClear}
        >
          <X className="size-3" />
        </Button>
      )}
    </ButtonGroup>
  )
}

export function GitHistoryGraphFilterButtons({
  worktreeId,
  items
}: {
  worktreeId: string
  /** Loaded commits; the User picker lists their authors. */
  items: readonly GitHistoryItem[]
}): React.JSX.Element {
  const filter = useGitHistoryGraphFilter(worktreeId)
  // Why the draft: it is what the search box shows, including text the debounce has not sent yet.
  const draftQuery = useGitHistoryGraphDraftQuery(worktreeId)
  const author = readGitHistoryGraphQueryToken(draftQuery, 'author')
  const path = readGitHistoryGraphQueryToken(draftQuery, 'path')
  const [userOpen, setUserOpen] = useState(false)
  const [pathsOpen, setPathsOpen] = useState(false)
  const [pathDraft, setPathDraft] = useState('')
  const authors = useMemo(() => {
    const loaded = collectGitHistoryAuthors(worktreeId, items)
    // Why: keep a typed author tickable even when no loaded commit lists them.
    return author && !loaded.includes(author) ? [author, ...loaded] : loaded
  }, [worktreeId, items, author])
  const pathNeedle = pathDraft.trim().toLowerCase()
  const recentPaths = listRecentGitHistoryGraphPaths(worktreeId).filter((entry) =>
    entry.toLowerCase().includes(pathNeedle)
  )

  const setToken = (key: GitHistoryGraphQueryTokenKey, value: string | null): void =>
    applyGitHistoryGraphQuery(worktreeId, setGitHistoryGraphQueryToken(draftQuery, key, value))

  const applyPath = (value: string): void => {
    const next = value.trim()
    if (!next) {
      return
    }
    rememberGitHistoryGraphPath(worktreeId, next)
    setToken('path', next)
    setPathsOpen(false)
    setPathDraft('')
  }

  const check = (on: boolean): React.JSX.Element => (
    <Check className={cn('size-3 text-muted-foreground', on ? 'opacity-70' : 'opacity-0')} />
  )

  const userLabel = translate('auto.components.right.sidebar.GitHistoryGraph.userFilter', 'User')
  const pathsLabel = translate('auto.components.right.sidebar.GitHistoryGraph.pathsFilter', 'Paths')

  return (
    <>
      <FilterButton
        icon={<User className="size-3 shrink-0" />}
        label={userLabel}
        value={author}
        shownValue={author}
        clearLabel={translate(
          'auto.components.right.sidebar.GitHistoryGraph.clearUserFilter',
          'Clear user filter'
        )}
        open={userOpen}
        onOpenChange={setUserOpen}
        onClear={() => setToken('author', null)}
      >
        <Command density="menu">
          <CommandInput
            placeholder={translate(
              'auto.components.right.sidebar.GitHistoryGraph.searchUsers',
              'Search users...'
            )}
          />
          <CommandList>
            <CommandEmpty>
              {translate(
                'auto.components.right.sidebar.GitHistoryGraph.noUsers',
                'No users in the loaded commits.'
              )}
            </CommandEmpty>
            <CommandGroup>
              {authors.map((name) => (
                <CommandItem
                  key={name}
                  value={name}
                  onSelect={() => {
                    setUserOpen(false)
                    setToken('author', name === author ? null : name)
                  }}
                >
                  {check(name === author)}
                  <span className="truncate">{name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </FilterButton>
      <FilterButton
        icon={<FileSearch className="size-3 shrink-0" />}
        label={pathsLabel}
        value={path}
        shownValue={path && shortPath(path)}
        clearLabel={translate(
          'auto.components.right.sidebar.GitHistoryGraph.clearPathFilter',
          'Clear path filter'
        )}
        open={pathsOpen}
        onOpenChange={(next) => {
          setPathsOpen(next)
          if (!next) {
            setPathDraft('')
          }
        }}
        onClear={() => setToken('path', null)}
      >
        {/* Why a Command: Enter applies the highlighted row, which is the typed path when there is one. */}
        <Command shouldFilter={false} density="menu">
          <CommandInput
            placeholder={translate(
              'auto.components.right.sidebar.GitHistoryGraph.typePath',
              'Repo-relative file or folder path'
            )}
            value={pathDraft}
            onValueChange={setPathDraft}
          />
          <CommandList>
            <CommandEmpty>
              {translate(
                'auto.components.right.sidebar.GitHistoryGraph.typePathHint',
                'Type a path, then press Enter.'
              )}
            </CommandEmpty>
            {pathDraft.trim() && (
              <CommandGroup>
                <CommandItem value="__apply-path__" onSelect={() => applyPath(pathDraft)}>
                  <FileSearch className="size-3 text-muted-foreground" />
                  <span className="truncate">
                    {translate(
                      'auto.components.right.sidebar.GitHistoryGraph.filterByPath',
                      'Filter by {{value0}}',
                      { value0: pathDraft.trim() }
                    )}
                  </span>
                </CommandItem>
              </CommandGroup>
            )}
            {recentPaths.length > 0 && (
              <CommandGroup
                heading={translate(
                  'auto.components.right.sidebar.GitHistoryGraph.recentPaths',
                  'Recent'
                )}
              >
                {recentPaths.map((entry) => (
                  <CommandItem
                    key={entry}
                    value={`recent-${entry}`}
                    title={entry}
                    onSelect={() => applyPath(entry)}
                  >
                    {check(entry === path)}
                    <span className="overflow-hidden text-ellipsis whitespace-pre">{entry}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </FilterButton>
      {(isGitHistoryGraphFiltered(filter) || draftQuery.trim() !== '') && (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="shrink-0"
          onClick={() => resetGitHistoryGraphFilterToDefault(worktreeId)}
        >
          {translate('auto.components.right.sidebar.GitHistoryGraph.clearFilters', 'Clear')}
        </Button>
      )}
    </>
  )
}
