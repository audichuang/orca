// Fork-only: the full Git Graph's branch tree (Fork's sidebar, IntelliJ's Branches pane).
import React, { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Cloud, GitBranch, Tag } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { rovingKeyTarget } from './git-graph-roving-keys'
import type { GitHistoryResult } from '../../../../../../shared/git-history'
import type { GitHistoryGraphRefOption } from '../../../../../../shared/git-history-graph-query-types'

/** Matches the tree's `w-56`; the details pane reserves it when capping its width. */
export const GIT_GRAPH_BRANCH_SIDEBAR_WIDTH = 224

// Git's own term, not UI copy.
const HEAD_LABEL = 'HEAD'

type BranchTreeEntry = {
  id: string
  name: string
  /** Loaded tip commit; absent when the tip is outside the current list. */
  tipId?: string
}

type BranchTreeSection = {
  key: string
  label: string
  icon: typeof GitBranch
  entries: BranchTreeEntry[]
}

export function buildBranchTreeSections(
  result: GitHistoryResult | undefined,
  refOptions: readonly GitHistoryGraphRefOption[] | null
): BranchTreeSection[] {
  const tipByRef = new Map<string, string>()
  const tags: BranchTreeEntry[] = []
  // Why decorations too: HEAD-only history and older hosts carry no ref list, yet commits name their branches.
  const decorated: GitHistoryGraphRefOption[] = []
  for (const item of result?.items ?? []) {
    for (const ref of item.references ?? []) {
      if (!tipByRef.has(ref.id)) {
        tipByRef.set(ref.id, item.id)
        if (ref.category === 'tags') {
          tags.push({ id: ref.id, name: ref.name, tipId: item.id })
        } else if (ref.category === 'branches' || ref.category === 'remote branches') {
          decorated.push({ fullName: ref.id, name: ref.name, category: ref.category })
        }
      }
    }
  }
  const allListed = result?.graph?.refs ?? refOptions ?? []
  // Why: tags already come from the loaded commits; a listed tag adds one whose commit is not loaded.
  const decoratedTags = new Set(tags.map((tag) => tag.id))
  for (const ref of allListed) {
    if (ref.category === 'tags' && !decoratedTags.has(ref.fullName)) {
      tags.push({ id: ref.fullName, name: ref.name })
    }
  }
  const listed = allListed.filter((ref) => ref.category !== 'tags')
  const listedNames = new Set(listed.map((ref) => ref.fullName))
  const branchRefs = [...listed, ...decorated.filter((ref) => !listedNames.has(ref.fullName))]
  const local: BranchTreeEntry[] = []
  const remotes = new Map<string, BranchTreeEntry[]>()
  for (const ref of branchRefs) {
    const entry = { id: ref.fullName, name: ref.name, tipId: tipByRef.get(ref.fullName) }
    if (ref.category === 'branches') {
      local.push(entry)
    } else {
      // Why the fallback: a ref under refs/remotes/<name>/ can exist without a configured remote.
      const remote = ref.remote ?? ref.name.split('/')[0] ?? ''
      remotes.set(remote, [...(remotes.get(remote) ?? []), entry])
    }
  }
  return [
    {
      key: 'local',
      label: translate('auto.components.right.sidebar.GitGraphBranchSidebar.local', 'Local'),
      icon: GitBranch,
      entries: local
    },
    ...[...remotes].map(([remote, entries]) => ({
      key: `remote:${remote}`,
      label: remote,
      icon: Cloud,
      entries
    })),
    {
      key: 'tags',
      label: translate('auto.components.right.sidebar.GitGraphBranchSidebar.tags', 'Tags'),
      icon: Tag,
      entries: tags
    }
  ].filter((section) => section.entries.length > 0)
}

export function GitGraphBranchSidebar({
  result,
  refOptions,
  headRefId,
  selectedTipIds,
  onJump,
  onShowRef
}: {
  result: GitHistoryResult | undefined
  /** Every branch on the host, fetched once; null until loaded or on hosts without the graph API. */
  refOptions: readonly GitHistoryGraphRefOption[] | null
  headRefId?: string
  /** Tips of the selected commits, highlighted in the tree. */
  selectedTipIds: ReadonlySet<string>
  onJump: (commitId: string) => void
  /** A branch whose tip is not loaded: narrow the graph to it. */
  onShowRef: (fullName: string) => void
}): React.JSX.Element {
  const sections = useMemo(() => buildBranchTreeSections(result, refOptions), [result, refOptions])
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  const toggle = (key: string): void =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (!next.delete(key)) {
        next.add(key)
      }
      return next
    })
  // Why one roving tab stop: every branch as its own Tab stop made the dialog dozens of presses deep.
  const [focusKey, setFocusKey] = useState<string | null>(null)
  const treeKeys = sections.flatMap((section) => [
    section.key,
    ...(collapsed.has(section.key) ? [] : section.entries.map((entry) => entry.id))
  ])
  const tabStopKey = focusKey !== null && treeKeys.includes(focusKey) ? focusKey : treeKeys[0]
  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>): void => {
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-tree-key]')]
    const active = document.activeElement
    const index = active instanceof HTMLButtonElement ? buttons.indexOf(active) : -1
    const next = rovingKeyTarget(event.key, index, buttons.length)
    if (next !== null) {
      event.preventDefault()
      buttons[next]?.focus()
    }
  }

  return (
    <nav
      onKeyDown={handleKeyDown}
      aria-label={translate(
        'auto.components.right.sidebar.GitGraphBranchSidebar.label',
        'Branches and tags'
      )}
      className="scrollbar-sleek flex w-56 shrink-0 flex-col overflow-y-auto border-r border-border py-1 text-xs"
    >
      {sections.length === 0 && (
        <p className="px-3 py-2 text-2xs text-muted-foreground">
          {translate(
            'auto.components.right.sidebar.GitGraphBranchSidebar.empty',
            'No branches loaded yet.'
          )}
        </p>
      )}
      {sections.map((section) => {
        const open = !collapsed.has(section.key)
        const Chevron = open ? ChevronDown : ChevronRight
        return (
          <div key={section.key} className="flex flex-col">
            <button
              type="button"
              className="flex h-6 items-center gap-1 px-2 text-left text-2xs font-semibold tracking-wider text-muted-foreground uppercase hover:text-foreground"
              aria-expanded={open}
              tabIndex={section.key === tabStopKey ? 0 : -1}
              data-tree-key={section.key}
              onFocus={() => setFocusKey(section.key)}
              onClick={() => toggle(section.key)}
            >
              <Chevron className="size-3 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{section.label}</span>
              <span className="font-normal tabular-nums">{section.entries.length}</span>
            </button>
            {open &&
              section.entries.map((entry) => {
                const Icon = section.icon
                const isHead = entry.id === headRefId
                const selected = entry.tipId !== undefined && selectedTipIds.has(entry.tipId)
                return (
                  <button
                    key={entry.id}
                    type="button"
                    className={cn(
                      'flex h-6 min-w-0 items-center gap-1.5 pr-2 pl-6 text-left transition-colors',
                      !selected && 'hover:bg-accent/40',
                      entry.tipId === undefined && 'text-muted-foreground'
                    )}
                    title={
                      entry.tipId === undefined
                        ? translate(
                            'auto.components.right.sidebar.GitGraphBranchSidebar.showRef',
                            'Not in the current list — click to show only this branch'
                          )
                        : entry.name
                    }
                    data-git-graph-row=""
                    data-selected={selected ? 'true' : undefined}
                    data-branch-ref={entry.id}
                    aria-pressed={selected}
                    tabIndex={entry.id === tabStopKey ? 0 : -1}
                    data-tree-key={entry.id}
                    onFocus={() => setFocusKey(entry.id)}
                    onClick={() =>
                      entry.tipId !== undefined ? onJump(entry.tipId) : onShowRef(entry.id)
                    }
                  >
                    <Icon aria-hidden="true" className="size-3 shrink-0 text-muted-foreground" />
                    <span className={cn('min-w-0 flex-1 truncate', isHead && 'font-semibold')}>
                      {entry.name}
                    </span>
                    {isHead && (
                      <span className="shrink-0 rounded-sm border border-border px-1 text-3xs text-muted-foreground">
                        {HEAD_LABEL}
                      </span>
                    )}
                  </button>
                )
              })}
          </div>
        )
      })}
    </nav>
  )
}
