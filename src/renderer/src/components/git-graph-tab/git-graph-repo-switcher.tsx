// Fork-only: picks which repo worktree a Git Graph tab shows.
import React, { useMemo, useState } from 'react'
import { Check, ChevronsUpDown, FolderGit2, FolderPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { GitGraphRepoChoice } from './git-graph-tab-model'

function groupByRepo(
  choices: readonly GitGraphRepoChoice[],
  selectedId: string | null
): { repoId: string; label: string; choices: GitGraphRepoChoice[] }[] {
  const groups = new Map<string, { repoId: string; label: string; choices: GitGraphRepoChoice[] }>()
  for (const choice of choices) {
    const group = groups.get(choice.repo.id) ?? {
      repoId: choice.repo.id,
      label: choice.repo.displayName,
      choices: []
    }
    group.choices.push(choice)
    groups.set(choice.repo.id, group)
  }
  const list = [...groups.values()]
  // Why: the current repo leads, so a long list opens on what is shown.
  const current = list.findIndex((group) =>
    group.choices.some((choice) => choice.worktree.id === selectedId)
  )
  return current > 0 ? [list[current]!, ...list.filter((_, index) => index !== current)] : list
}

export function GitGraphRepoSwitcher({
  choices,
  value,
  onValueChange,
  addRepos
}: {
  /** From listGitGraphRepoChoices for the tab's workspace. */
  choices: readonly GitGraphRepoChoice[]
  value: string | null
  onValueChange: (repoWorktreeId: string) => void
  /** Folder workspaces only: an entry for the repos under the folder that Orca has not added. */
  addRepos?: { label: string; hidden: boolean; onMenuOpen: () => void; onSelect: () => void }
}): React.JSX.Element | null {
  const [open, setOpen] = useState(false)
  const groups = useMemo(() => groupByRepo(choices, value), [choices, value])
  const selected = choices.find((choice) => choice.worktree.id === value) ?? null
  if (choices.length === 0) {
    return null
  }
  const label = translate('auto.components.gitGraphTab.repoSwitcher', 'Repository')
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) {
          addRepos?.onMenuOpen()
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="xs"
          role="combobox"
          aria-expanded={open}
          aria-label={label}
          className="max-w-[40%] shrink-0 justify-between"
        >
          <FolderGit2 className="size-3 shrink-0" />
          <span className="truncate">
            {selected
              ? `${selected.repo.displayName} · ${selected.worktree.displayName}`
              : translate('auto.components.gitGraphTab.selectRepo', 'Select repository')}
          </span>
          <ChevronsUpDown className="size-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(320px,calc(100vw-1rem))]">
        <Command>
          <CommandInput
            placeholder={translate(
              'auto.components.gitGraphTab.searchRepos',
              'Search repositories...'
            )}
          />
          <CommandList className="max-h-72">
            <CommandEmpty>
              {translate('auto.components.gitGraphTab.noRepos', 'No repositories found.')}
            </CommandEmpty>
            {groups.map((group) => (
              <CommandGroup key={group.repoId} heading={group.label}>
                {group.choices.map((choice) => (
                  <CommandItem
                    key={choice.worktree.id}
                    value={`${group.label} ${choice.worktree.displayName} ${choice.worktree.path}`}
                    onSelect={() => {
                      setOpen(false)
                      if (choice.worktree.id !== value) {
                        onValueChange(choice.worktree.id)
                      }
                    }}
                  >
                    <Check
                      className={cn(
                        'size-3 text-muted-foreground',
                        choice.worktree.id === value ? 'opacity-70' : 'opacity-0'
                      )}
                    />
                    <span className="truncate">{choice.worktree.displayName}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
          {addRepos && !addRepos.hidden && (
            <>
              <CommandSeparator alwaysRender />
              {/* Why outside the list and forceMount: stays in view however long the list or whatever the search. */}
              <CommandGroup forceMount>
                <CommandItem
                  forceMount
                  value="__add-repos__"
                  onSelect={() => {
                    setOpen(false)
                    addRepos.onSelect()
                  }}
                >
                  <FolderPlus className="size-3 text-muted-foreground" />
                  <span className="truncate">{addRepos.label}</span>
                </CommandItem>
              </CommandGroup>
            </>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  )
}
