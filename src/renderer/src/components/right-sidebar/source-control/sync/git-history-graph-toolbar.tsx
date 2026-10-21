// Fork-only: scope / branch filter and git-side search for the Commits graph.
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronsUpDown, GitBranch, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ImeInput } from '@/lib/ime-text-field'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { RuntimeClientTarget } from '../../../../../../shared/runtime-client-target'
import { getConnectionId } from '@/lib/connection-context'
import { getRuntimeGitHistory } from '@/runtime/runtime-git-status-client'
import { requireGitOwnerTarget } from '../../worktree-git-owner-target'
import type { GitHistoryGraphApplied } from '../../../../../../shared/git-history-graph-query-types'
import type { GitHistoryPanelState } from './git-history-panel'
import { GitHistoryGraphBranchGroups } from './git-history-graph-branch-groups'
import { GitHistoryGraphHostNotice, hostTooOldText } from './git-history-graph-host-status'
import { GitHistoryGraphFilterButtons } from './git-history-graph-filter-buttons'
import {
  mergeGitHistoryGraphFreeText,
  stripGitHistoryGraphQueryTokens
} from './git-history-graph-query-tokens'
import {
  getGitHistoryGraphDraftQuery,
  getGitHistoryGraphFilter,
  setGitHistoryGraphDraftQuery,
  updateGitHistoryGraphFilter,
  useGitHistoryGraphDraftQuery,
  useGitHistoryGraphFilter,
  type GitHistoryGraphFilter
} from './git-history-graph-filter'

const SEARCH_DEBOUNCE_MS = 350

type RefOptions =
  | { status: 'idle' | 'loading' }
  | { status: 'ready'; applied: GitHistoryGraphApplied }
  | { status: 'unsupported' | 'error' }

function scopeLabel(filter: GitHistoryGraphFilter, applied: GitHistoryGraphApplied | null): string {
  if (filter.scope === 'all') {
    return translate('auto.components.right.sidebar.GitHistoryGraph.allBranches', 'All branches')
  }
  if (filter.scope === 'refs') {
    if (filter.refs.length === 1) {
      const ref = applied?.refs.find((option) => option.fullName === filter.refs[0])
      return ref?.name ?? filter.refs[0].replace(/^refs\/(heads|remotes)\//, '')
    }
    return translate(
      'auto.components.right.sidebar.GitHistoryGraph.branchCount',
      '{{value0}} branches',
      {
        value0: filter.refs.length
      }
    )
  }
  return translate('auto.components.right.sidebar.GitHistoryGraph.currentBranch', 'Current branch')
}

function hasRemote(filter: GitHistoryGraphFilter, remote: string): boolean {
  return filter.remotes === 'all' || filter.remotes.includes(remote)
}

/** Lists branches and remotes on the repo's own host; null when that host predates the graph. */
export async function loadRefOptions(args: {
  worktreeId: string
  worktreePath: string
  activeRepoTarget: RuntimeClientTarget | null
}): Promise<GitHistoryGraphApplied | null> {
  const result = await getRuntimeGitHistory(
    {
      // Why: route the read by the repo OWNER host, not the focused runtime.
      target: requireGitOwnerTarget(args.activeRepoTarget),
      worktreeId: args.worktreeId,
      worktreePath: args.worktreePath,
      connectionId: getConnectionId(args.worktreeId) ?? undefined
    },
    { limit: 1, graph: { mode: 'head', limit: 1 } }
  )
  return result.graph ?? null
}

export function GitHistoryGraphToolbar({
  worktreeId,
  worktreePath,
  activeRepoTarget,
  state,
  trailing,
  fullView = false
}: {
  worktreeId: string
  worktreePath: string
  activeRepoTarget: RuntimeClientTarget | null
  state: GitHistoryPanelState
  /** Rendered at the end of the filter row. */
  trailing?: React.ReactNode
  /** The Git Graph tab's wide toolbar: User / Paths buttons, Clear, and wrapping. Off in the sidebar. */
  fullView?: boolean
}): React.JSX.Element {
  const result = state.result
  const filter = useGitHistoryGraphFilter(worktreeId)
  const [open, setOpen] = useState(false)
  const [branchQuery, setBranchQuery] = useState('')
  const draftQuery = useGitHistoryGraphDraftQuery(worktreeId)
  const setDraftQuery = (query: string): void => setGitHistoryGraphDraftQuery(worktreeId, query)
  // Why: the full view shows author/path as buttons, so its box holds only the free text; while
  // focused it keeps what was typed, so a half-typed `author:` token is not yanked out of the box.
  const [focusedText, setFocusedText] = useState<string | null>(null)
  const searchText = fullView
    ? (focusedText ?? stripGitHistoryGraphQueryTokens(draftQuery))
    : draftQuery
  const changeSearchText = (text: string): void => {
    if (!fullView) {
      setDraftQuery(text)
      return
    }
    setDraftQuery(mergeGitHistoryGraphFreeText(draftQuery, searchText, text))
    setFocusedText((prev) => (prev === null ? null : text))
  }
  const [fetched, setFetched] = useState<RefOptions>({ status: 'idle' })
  // Why: the open-time read is the single source; the last graph result only fills the list until it lands.
  const refOptions: RefOptions =
    fetched.status === 'ready' || !result?.graph
      ? fetched
      : { status: 'ready', applied: result.graph }
  const applied = refOptions.status === 'ready' ? refOptions.applied : null

  // Why: re-sync when another worktree's filter is shown in this same panel instance.
  const [shownWorktreeId, setShownWorktreeId] = useState(worktreeId)
  const refRequestId = useRef(0)
  if (shownWorktreeId !== worktreeId) {
    setShownWorktreeId(worktreeId)
    setFetched({ status: 'idle' })
  }

  // Why: drop a branch list still in flight for the worktree this panel just left.
  useEffect(
    () => () => {
      refRequestId.current += 1
    },
    [worktreeId]
  )

  useEffect(() => {
    if (draftQuery === filter.query) {
      return
    }
    // Why re-read: every mounted toolbar runs this timer; only the first commit of the latest draft should refetch.
    const timer = window.setTimeout(() => {
      const latest = getGitHistoryGraphDraftQuery(worktreeId)
      if (latest !== getGitHistoryGraphFilter(worktreeId).query) {
        updateGitHistoryGraphFilter(worktreeId, { query: latest })
      }
    }, SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [draftQuery, filter.query, worktreeId])

  const handleOpenChange = (nextOpen: boolean): void => {
    setOpen(nextOpen)
    if (!nextOpen) {
      setBranchQuery('')
      return
    }
    // Why: re-read on every open so branches created since the last open show up; keep the old list meanwhile.
    const requestId = ++refRequestId.current
    const isCurrent = (): boolean => requestId === refRequestId.current
    setFetched((prev) => (prev.status === 'ready' ? prev : { status: 'loading' }))
    loadRefOptions({ worktreeId, worktreePath, activeRepoTarget })
      .then((graph) => {
        if (isCurrent()) {
          setFetched(graph ? { status: 'ready', applied: graph } : { status: 'unsupported' })
        }
      })
      .catch(() => {
        if (isCurrent()) {
          setFetched((prev) => (prev.status === 'ready' ? prev : { status: 'error' }))
        }
      })
  }

  const visibleRefs = useMemo(() => {
    const needle = branchQuery.trim().toLowerCase()
    const refs = applied?.refs ?? []
    return needle ? refs.filter((ref) => ref.name.toLowerCase().includes(needle)) : refs
  }, [applied, branchQuery])

  const toggleRef = (fullName: string): void => {
    const current = filter.scope === 'refs' ? filter.refs : []
    const refs = current.includes(fullName)
      ? current.filter((ref) => ref !== fullName)
      : [...current, fullName]
    updateGitHistoryGraphFilter(
      worktreeId,
      refs.length ? { scope: 'refs', refs } : { scope: 'head', refs: [] }
    )
  }

  const toggleRemote = (remote: string): void => {
    const remotes = applied?.remotes ?? []
    const current = filter.remotes === 'all' ? remotes : filter.remotes
    const next = current.includes(remote)
      ? current.filter((name) => name !== remote)
      : [...current, remote]
    updateGitHistoryGraphFilter(worktreeId, { scope: 'all', remotes: next })
  }

  const check = (on: boolean): React.JSX.Element => (
    <Check className={cn('size-3 text-muted-foreground', on ? 'opacity-70' : 'opacity-0')} />
  )

  return (
    <div className="flex flex-col gap-1 px-3 pb-1.5">
      <div className={cn('flex min-w-0 items-center gap-1.5', fullView && 'flex-wrap gap-y-1')}>
        <Popover open={open} onOpenChange={handleOpenChange}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="xs"
              role="combobox"
              aria-expanded={open}
              aria-label={translate(
                'auto.components.right.sidebar.GitHistoryGraph.branchFilter',
                'Branch filter'
              )}
              className="max-w-[45%] shrink-0 justify-between"
            >
              <GitBranch className="size-3 shrink-0" />
              <span className="truncate">{scopeLabel(filter, applied)}</span>
              <ChevronsUpDown className="size-3 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[min(300px,calc(100vw-1rem))]">
            <Command shouldFilter={false} density="menu">
              <CommandInput
                placeholder={translate(
                  'auto.components.right.sidebar.GitHistoryGraph.searchBranches',
                  'Search branches...'
                )}
                value={branchQuery}
                onValueChange={setBranchQuery}
              />
              <CommandList>
                <CommandGroup
                  heading={translate('auto.components.right.sidebar.GitHistoryGraph.scope', 'Show')}
                >
                  <CommandItem
                    value="scope-head"
                    onSelect={() =>
                      updateGitHistoryGraphFilter(worktreeId, { scope: 'head', refs: [] })
                    }
                  >
                    {check(filter.scope === 'head')}
                    {translate(
                      'auto.components.right.sidebar.GitHistoryGraph.currentBranch',
                      'Current branch'
                    )}
                  </CommandItem>
                  <CommandItem
                    value="scope-all"
                    disabled={refOptions.status === 'unsupported'}
                    onSelect={() =>
                      updateGitHistoryGraphFilter(worktreeId, { scope: 'all', refs: [] })
                    }
                  >
                    {check(filter.scope === 'all')}
                    {translate(
                      'auto.components.right.sidebar.GitHistoryGraph.allBranches',
                      'All branches'
                    )}
                  </CommandItem>
                </CommandGroup>
                {filter.scope === 'all' && applied && (
                  <CommandGroup
                    heading={translate(
                      'auto.components.right.sidebar.GitHistoryGraph.sources',
                      'Sources'
                    )}
                  >
                    <CommandItem
                      value="source-local"
                      onSelect={() =>
                        updateGitHistoryGraphFilter(worktreeId, { local: !filter.local })
                      }
                    >
                      {check(filter.local)}
                      {translate(
                        'auto.components.right.sidebar.GitHistoryGraph.localBranches',
                        'Local branches'
                      )}
                    </CommandItem>
                    {applied.remotes.map((remote) => (
                      <CommandItem
                        key={remote}
                        value={`source-remote-${remote}`}
                        onSelect={() => toggleRemote(remote)}
                      >
                        {check(hasRemote(filter, remote))}
                        <span className="truncate">{remote}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                {refOptions.status !== 'ready' && refOptions.status !== 'idle' && (
                  <CommandGroup>
                    {refOptions.status === 'loading' && (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">
                        {translate(
                          'auto.components.right.sidebar.GitHistoryGraph.loadingBranches',
                          'Loading branches...'
                        )}
                      </div>
                    )}
                    {(refOptions.status === 'unsupported' || refOptions.status === 'error') && (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">
                        {refOptions.status === 'unsupported'
                          ? hostTooOldText()
                          : translate(
                              'auto.components.right.sidebar.GitHistoryGraph.branchesFailed',
                              'Failed to load branches'
                            )}
                      </div>
                    )}
                  </CommandGroup>
                )}
                <GitHistoryGraphBranchGroups
                  refs={visibleRefs}
                  isChecked={(fullName) =>
                    filter.scope === 'refs' && filter.refs.includes(fullName)
                  }
                  renderCheck={check}
                  onToggle={toggleRef}
                />
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {fullView && (
          <GitHistoryGraphFilterButtons worktreeId={worktreeId} items={result?.items ?? []} />
        )}
        <div
          className={cn(
            'flex min-w-0 flex-1 items-center gap-1 rounded-md border border-input px-1.5',
            fullView && 'min-w-40'
          )}
        >
          <Search className="size-3 shrink-0 text-muted-foreground" />
          <ImeInput
            type="text"
            value={searchText}
            onFocus={() =>
              setFocusedText(fullView ? stripGitHistoryGraphQueryTokens(draftQuery) : null)
            }
            onBlur={() => setFocusedText(null)}
            onChange={(event) => changeSearchText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                changeSearchText('')
              }
            }}
            placeholder={
              fullView
                ? translate(
                    'auto.components.right.sidebar.GitHistoryGraph.searchCommitMessages',
                    'Search commit messages'
                  )
                : translate(
                    'auto.components.right.sidebar.GitHistoryGraph.searchCommits',
                    'Search commits (author: path:)'
                  )
            }
            aria-label={translate(
              'auto.components.right.sidebar.GitHistoryGraph.searchCommitsLabel',
              'Search commits'
            )}
            className="h-6 min-w-0 flex-1 bg-transparent text-2xs text-foreground outline-none placeholder:text-muted-foreground/60"
          />
        </div>
        {trailing}
      </div>
      <GitHistoryGraphHostNotice worktreeId={worktreeId} state={state} />
    </div>
  )
}
