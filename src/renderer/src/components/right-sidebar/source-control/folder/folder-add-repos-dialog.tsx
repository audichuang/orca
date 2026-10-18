import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import type { FolderWorkspace } from '../../../../../../shared/folder-workspace-types'
import type { NestedRepoCandidate } from '../../../../../../shared/project-group-types'
import {
  getNewNestedRepoCandidates,
  nestedRepoRelativeLabel
} from './folder-nested-repo-candidates'
import {
  folderSidebarHiddenRepoKey,
  setReposHiddenFromSidebar
} from './folder-sidebar-hidden-repos'

// Why deeper than Add Project's default 3: monorepo folders nest repos inside repos (cat/docs/etf).
const SCAN_OPTIONS = { descendIntoRepos: true, maxDepth: 4 }

type ScanState =
  | { phase: 'scanning' }
  | { phase: 'ready'; candidates: NestedRepoCandidate[]; truncated: boolean }
  | { phase: 'failed' }

/** Finds Git repos inside a local folder workspace, nested ones included, and adds the picked ones to Orca. */
export function FolderAddReposDialog({
  folderWorkspace,
  onClose
}: {
  folderWorkspace: FolderWorkspace
  onClose: () => void
}): React.JSX.Element {
  const [scan, setScan] = useState<ScanState>({ phase: 'scanning' })
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [hideFromSidebar, setHideFromSidebar] = useState(true)
  const [adding, setAdding] = useState(false)
  const { folderPath } = folderWorkspace

  useEffect(() => {
    let cancelled = false
    window.api.projectGroups
      .scanNested({ path: folderPath, options: SCAN_OPTIONS })
      .then((result) => {
        if (!cancelled) {
          // Why: the repo list is read once, so repos added while the dialog is open never vanish from it.
          const candidates = getNewNestedRepoCandidates({
            folderPath,
            folderOwner: folderWorkspace,
            scanned: result.repos,
            repos: useAppStore.getState().repos
          })
          setScan({ phase: 'ready', candidates, truncated: result.truncated || result.timedOut })
        }
      })
      .catch(() => {
        if (!cancelled) {
          setScan({ phase: 'failed' })
        }
      })
    return () => {
      cancelled = true
    }
  }, [folderPath, folderWorkspace])

  const toggle = (path: string, checked: boolean) => {
    setSelected((previous) => {
      const next = new Set(previous)
      if (checked) {
        next.add(path)
      } else {
        next.delete(path)
      }
      return next
    })
  }

  const addSelected = async () => {
    setAdding(true)
    const { addRepoPath, fetchWorktrees } = useAppStore.getState()
    for (const path of selected) {
      const guess = { ...folderWorkspace, path }
      if (hideFromSidebar) {
        // Why before the add: the sidebar would otherwise flash the new project for a frame.
        setReposHiddenFromSidebar([guess], true)
      }
      const repo = await addRepoPath(path, 'git', { runtimeEnvironmentId: null })
      if (
        hideFromSidebar &&
        (!repo || folderSidebarHiddenRepoKey(repo) !== folderSidebarHiddenRepoKey(guess))
      ) {
        setReposHiddenFromSidebar([guess], false)
        if (repo) {
          setReposHiddenFromSidebar([repo], true)
        }
      }
      if (repo) {
        await fetchWorktrees(repo.id)
      }
    }
    setAdding(false)
    onClose()
  }

  const candidates = scan.phase === 'ready' ? scan.candidates : []

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !adding) {
          onClose()
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {translate(
              'auto.components.right.sidebar.source.control.folder.folder.add.repos.dialog.title',
              'Add repositories in this folder'
            )}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.right.sidebar.source.control.folder.folder.add.repos.dialog.description',
              'Git repositories under {{value0}}, including ones nested inside other repositories.',
              { value0: folderWorkspace.name }
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-w-0 flex-col gap-3">
          {scan.phase === 'scanning' && (
            <div className="text-xs text-muted-foreground">
              {translate(
                'auto.components.right.sidebar.source.control.folder.folder.add.repos.dialog.scanning',
                'Scanning for repositories...'
              )}
            </div>
          )}
          {scan.phase === 'failed' && (
            <div className="text-xs text-destructive">
              {translate(
                'auto.components.right.sidebar.source.control.folder.folder.add.repos.dialog.failed',
                'Could not scan this folder.'
              )}
            </div>
          )}
          {scan.phase === 'ready' && candidates.length === 0 && (
            <div className="text-xs text-muted-foreground">
              {translate(
                'auto.components.right.sidebar.source.control.folder.folder.add.repos.dialog.none',
                'Every repository in this folder is already added.'
              )}
            </div>
          )}
          {candidates.length > 0 && (
            <ul className="flex max-h-64 flex-col gap-1.5 overflow-y-auto scrollbar-sleek">
              {candidates.map((candidate) => {
                const id = `folder-add-repo-${candidate.path}`
                return (
                  <li key={candidate.path} className="flex min-w-0 items-center gap-2">
                    <Checkbox
                      id={id}
                      checked={selected.has(candidate.path)}
                      disabled={adding}
                      onCheckedChange={(checked) => toggle(candidate.path, checked === true)}
                    />
                    <Label htmlFor={id} className="min-w-0" title={candidate.path}>
                      <span className="truncate font-mono">
                        {nestedRepoRelativeLabel(folderPath, candidate.path)}
                      </span>
                    </Label>
                  </li>
                )
              })}
            </ul>
          )}
          {scan.phase === 'ready' && scan.truncated && (
            <div className="text-[11px] text-muted-foreground">
              {translate(
                'auto.components.right.sidebar.source.control.folder.folder.add.repos.dialog.truncated',
                'The scan stopped early, so some repositories may be missing.'
              )}
            </div>
          )}
          <div className="flex items-center gap-2">
            <Checkbox
              id="folder-add-repos-hide"
              checked={hideFromSidebar}
              disabled={adding}
              onCheckedChange={(checked) => setHideFromSidebar(checked === true)}
            />
            <Label htmlFor="folder-add-repos-hide">
              {translate(
                'auto.components.right.sidebar.source.control.folder.folder.add.repos.dialog.hide',
                'Show only in this folder, not as sidebar projects'
              )}
            </Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={adding} onClick={onClose}>
            {translate(
              'auto.components.right.sidebar.source.control.folder.folder.add.repos.dialog.cancel',
              'Cancel'
            )}
          </Button>
          <Button disabled={adding || selected.size === 0} onClick={() => void addSelected()}>
            {translate(
              'auto.components.right.sidebar.source.control.folder.folder.add.repos.dialog.add',
              'Add ({{value0}})',
              { value0: selected.size }
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
