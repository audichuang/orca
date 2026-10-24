// Fork-only: the branch filter's list, split into local branches, one section per remote, and tags.
import type React from 'react'
import { Cloud, GitBranch, Tag } from 'lucide-react'
import { CommandGroup, CommandItem } from '@/components/ui/command'
import { translate } from '@/i18n/i18n'
import type { GitHistoryGraphRefOption } from '../../../../../../shared/git-history-graph-query-types'

type BranchSection = {
  key: string
  /** The remote a remote-branch section belongs to; 'tags' for the tag section. */
  remote: string | null
  tags?: boolean
  refs: GitHistoryGraphRefOption[]
}

export function groupRefsBySource(refs: readonly GitHistoryGraphRefOption[]): BranchSection[] {
  const local: GitHistoryGraphRefOption[] = []
  const tags: GitHistoryGraphRefOption[] = []
  const remotes = new Map<string, GitHistoryGraphRefOption[]>()
  for (const ref of refs) {
    if (ref.category === 'tags') {
      tags.push(ref)
      continue
    }
    if (ref.category !== 'remote branches') {
      local.push(ref)
      continue
    }
    const remote = ref.remote ?? ref.name.split('/')[0]!
    remotes.set(remote, [...(remotes.get(remote) ?? []), ref])
  }
  return [
    ...(local.length ? [{ key: 'local', remote: null, refs: local }] : []),
    ...[...remotes].map(([remote, list]) => ({ key: `remote:${remote}`, remote, refs: list })),
    ...(tags.length ? [{ key: 'tags', remote: null, tags: true, refs: tags }] : [])
  ]
}

function sectionHeading(section: BranchSection): React.JSX.Element {
  const Icon = section.tags ? Tag : section.remote ? Cloud : GitBranch
  return (
    <span className="flex items-center gap-1.5">
      <Icon className="size-3" />
      {section.tags
        ? translate('auto.components.right.sidebar.GitHistoryGraph.tags', 'Tags')
        : (section.remote ??
          translate('auto.components.right.sidebar.GitHistoryGraph.local', 'Local'))}
    </span>
  )
}

export function GitHistoryGraphBranchGroups({
  refs,
  isChecked,
  renderCheck,
  onToggle
}: {
  refs: readonly GitHistoryGraphRefOption[]
  isChecked: (fullName: string) => boolean
  renderCheck: (on: boolean) => React.JSX.Element
  onToggle: (fullName: string) => void
}): React.JSX.Element {
  return (
    <>
      {groupRefsBySource(refs).map((section) => (
        <CommandGroup key={section.key} heading={sectionHeading(section)}>
          {section.refs.map((ref) => (
            <CommandItem
              key={ref.fullName}
              value={ref.fullName}
              title={ref.name}
              onSelect={() => onToggle(ref.fullName)}
            >
              {renderCheck(isChecked(ref.fullName))}
              <span className="min-w-0 flex-1 truncate">
                {/* Why: the section heading already names the remote. */}
                {section.remote && ref.name.startsWith(`${section.remote}/`)
                  ? ref.name.slice(section.remote.length + 1)
                  : ref.name}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
      ))}
    </>
  )
}
