// Fork-only: names the repo a folder workspace's Source Control panel is showing.
import { RepoBadgeMark } from '@/components/repo/RepoBadgeLabel'

export function FolderScopeLabel({ label, color }: { label: string; color?: string }) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-1.5 text-xs font-medium" title={label}>
      {color && <RepoBadgeMark color={color} className="size-2.5 rounded-[2px]" />}
      <span className="truncate">{label}</span>
    </span>
  )
}
