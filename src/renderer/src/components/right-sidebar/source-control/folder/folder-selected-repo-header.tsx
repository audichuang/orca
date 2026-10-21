// Fork-only: names the repo whose panel sits under a folder workspace's repo list.
import { RepoBadgeMark } from '@/components/repo/RepoBadgeLabel'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'

/** Color mark, name and upstream; the panel below already shows the branch, so it is not repeated. */
export function FolderSelectedRepoHeader({
  worktreeId,
  name,
  path,
  color
}: {
  worktreeId: string
  name: string
  path: string
  color: string
}) {
  const upstream = useAppStore((s) => {
    const status = s.remoteStatusesByWorktree[worktreeId]
    return status?.hasUpstream ? (status.upstreamName ?? null) : null
  })
  return (
    <div
      data-folder-repo-header
      className="flex shrink-0 items-center gap-1.5 px-3 pt-1.5 text-xs"
      title={path}
    >
      <RepoBadgeMark color={color} className="size-2.5 rounded-[2px]" />
      <span className="min-w-0 truncate font-semibold text-foreground">{name}</span>
      {upstream && (
        <span className="min-w-0 truncate text-2xs text-muted-foreground">
          {translate(
            'auto.components.right.sidebar.source.control.folder.folder.selected.repo.header.tracks',
            'tracks {{value0}}',
            { value0: upstream }
          )}
        </span>
      )}
    </div>
  )
}
