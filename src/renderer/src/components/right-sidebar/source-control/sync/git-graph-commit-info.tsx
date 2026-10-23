// Fork-only: Fork-style commit details (author, dates, SHA, parents, refs, containing branches).
import React from 'react'
import { Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import type {
  GitHistoryGraphColorId,
  GitHistoryItem,
  GitHistoryItemRef
} from '../../../../../../shared/git-history'
import { dedupeRemoteTrackingRefs } from '../../../../../../shared/git-history-ref-display'
import type { GitGraphBranchContainment } from './git-graph-branch-containment'
import { formatGitHistoryTimestamp } from './git-history-format'
import { formatGitGraphRelativeDate, formatGitGraphShortDate } from './git-graph-date-format'
import { GitGraphAuthorAvatar, GitGraphRefBadge } from './git-graph-full-row'

// Git's own term, not UI copy.
const SHA_LABEL = 'SHA'
// Why capped: a commit deep in history can sit on hundreds of branches.
const CONTAINING_BRANCH_LIMIT = 12

export type GitGraphCommitContext = {
  itemsById: ReadonlyMap<string, GitHistoryItem>
  containment: GitGraphBranchContainment
  /** Display names of every branch ref in the list, keyed by full ref id. */
  branchNames: ReadonlyMap<string, string>
  /** Lane colors the graph assigned to refs; raw history items carry none. */
  refColors: ReadonlyMap<string, GitHistoryGraphColorId>
  headRefId?: string
  onJump: (commitId: string) => void
}

function InfoRow({
  label,
  hint,
  children
}: {
  label: string
  /** What the value covers, when that is not obvious from the label. */
  hint?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <>
      <dt className="text-2xs text-muted-foreground" title={hint}>
        {label}
      </dt>
      <dd className="min-w-0 text-xs text-foreground">{children}</dd>
    </>
  )
}

function CommitLink({
  id,
  context
}: {
  id: string
  context: GitGraphCommitContext
}): React.JSX.Element {
  const target = context.itemsById.get(id)
  if (!target) {
    return <span className="font-mono text-2xs text-muted-foreground">{id.slice(0, 7)}</span>
  }
  return (
    // Why not <Button variant="link">: a hash link is mono caption text, which the primitive owns.
    <button
      type="button"
      className="font-mono text-2xs text-primary hover:underline"
      title={target.subject}
      onClick={() => context.onJump(id)}
    >
      {target.displayId ?? id.slice(0, 7)}
    </button>
  )
}

export function GitGraphCommitInfo({
  item,
  context
}: {
  item: GitHistoryItem
  context: GitGraphCommitContext
}): React.JSX.Element {
  const refs = dedupeRemoteTrackingRefs(item.references ?? []).map((ref) => ({
    ...ref,
    color: ref.color ?? context.refColors.get(ref.id)
  }))
  const body = item.message.startsWith(item.subject)
    ? item.message.slice(item.subject.length).trim()
    : item.message.trim()
  const containing = context.containment.get(item.id) ?? []
  // Why listed: with Parents it is the keyboard route along an edge the graph folds into arrows.
  const childIds = [...context.itemsById.values()]
    .filter((candidate) => candidate.parentIds.includes(item.id))
    .map((candidate) => candidate.id)
  const copySha = (): void => void window.api.ui.writeClipboardText(item.id)
  const branchBadge = (refId: string): GitHistoryItemRef => ({
    id: refId,
    name: context.branchNames.get(refId) ?? refId.replace(/^refs\/(heads|remotes)\//, ''),
    category: refId.startsWith('refs/remotes/') ? 'remote branches' : 'branches',
    color: context.refColors.get(refId)
  })
  return (
    <div className="flex flex-col gap-2 px-3 py-2">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium break-words text-foreground select-text">
          {item.subject}
        </p>
        {body && (
          <p className="text-xs break-words whitespace-pre-wrap text-foreground select-text">
            {body}
          </p>
        )}
      </div>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1">
        {item.author && (
          <InfoRow
            label={translate('auto.components.right.sidebar.GitGraphCommitInfo.author', 'Author')}
          >
            <span className="flex min-w-0 items-center gap-1.5 select-text">
              <GitGraphAuthorAvatar name={item.author} email={item.authorEmail} />
              <span className="truncate">
                {item.author}
                {item.authorEmail && (
                  <span className="text-muted-foreground">{` <${item.authorEmail}>`}</span>
                )}
              </span>
            </span>
          </InfoRow>
        )}
        {item.timestamp != null && (
          <InfoRow
            label={translate('auto.components.right.sidebar.GitGraphCommitInfo.date', 'Date')}
          >
            <span className="select-text">{formatGitHistoryTimestamp(item.timestamp)}</span>
            <span className="text-muted-foreground">
              {' '}
              · {formatGitGraphRelativeDate(item.timestamp)}
            </span>
          </InfoRow>
        )}
        <InfoRow label={SHA_LABEL}>
          <span className="flex min-w-0 items-center gap-1">
            <span className="truncate font-mono text-2xs select-text">{item.id}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={translate(
                'auto.components.right.sidebar.GitGraphCommitInfo.copySha',
                'Copy commit SHA'
              )}
              onClick={copySha}
            >
              <Copy className="size-3" />
            </Button>
          </span>
        </InfoRow>
        {item.parentIds.length > 0 && (
          <InfoRow
            label={translate('auto.components.right.sidebar.GitGraphCommitInfo.parents', 'Parents')}
          >
            <span className="flex flex-wrap gap-2">
              {item.parentIds.map((id) => (
                <CommitLink key={id} id={id} context={context} />
              ))}
            </span>
          </InfoRow>
        )}
        {childIds.length > 0 && (
          <InfoRow
            label={translate(
              'auto.components.right.sidebar.GitGraphCommitInfo.children',
              'Children'
            )}
            hint={translate(
              'auto.components.right.sidebar.GitGraphCommitInfo.childrenHint',
              'Commits in the loaded list whose parent is this commit.'
            )}
          >
            <span className="flex flex-wrap gap-2">
              {childIds.map((id) => (
                <CommitLink key={id} id={id} context={context} />
              ))}
            </span>
          </InfoRow>
        )}
        {refs.length > 0 && (
          <InfoRow
            label={translate('auto.components.right.sidebar.GitGraphCommitInfo.refs', 'Refs')}
          >
            <span className="flex flex-wrap gap-1">
              {refs.map((ref) => (
                <GitGraphRefBadge
                  key={ref.id}
                  itemRef={ref}
                  isHead={ref.id === context.headRefId}
                />
              ))}
            </span>
          </InfoRow>
        )}
        {containing.length > 0 && (
          <InfoRow
            label={translate(
              'auto.components.right.sidebar.GitGraphCommitInfo.containedIn',
              'In branches'
            )}
            hint={translate(
              'auto.components.right.sidebar.GitGraphCommitInfo.containedInHint',
              'Branches whose tips are in the loaded list; branches outside it are not counted.'
            )}
          >
            <span className="flex flex-wrap gap-1">
              {containing.slice(0, CONTAINING_BRANCH_LIMIT).map((refId) => (
                <GitGraphRefBadge
                  key={refId}
                  itemRef={branchBadge(refId)}
                  isHead={refId === context.headRefId}
                />
              ))}
              {containing.length > CONTAINING_BRANCH_LIMIT && (
                <span className="text-2xs text-muted-foreground">
                  {translate(
                    'auto.components.right.sidebar.GitGraphCommitInfo.moreBranches',
                    '+{{count}} more',
                    { count: containing.length - CONTAINING_BRANCH_LIMIT }
                  )}
                </span>
              )}
            </span>
          </InfoRow>
        )}
      </dl>
    </div>
  )
}

export function GitGraphCommitsSummary({
  items,
  onJump
}: {
  items: readonly GitHistoryItem[]
  onJump: (commitId: string) => void
}): React.JSX.Element {
  return (
    <ul className="@container flex flex-col py-1">
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            className="flex w-full min-w-0 items-center gap-2 px-3 py-0.5 text-left text-xs hover:bg-accent/40"
            onClick={() => onJump(item.id)}
          >
            <span className="shrink-0 font-mono text-2xs text-muted-foreground">
              {item.displayId}
            </span>
            <span className="min-w-0 flex-1 truncate text-foreground" title={item.subject}>
              {item.subject}
            </span>
            {/* Why: in a narrow details pane the subject matters more than avatar and date. */}
            {item.author && (
              <span className="shrink-0 @max-xs:hidden">
                <GitGraphAuthorAvatar name={item.author} email={item.authorEmail} />
              </span>
            )}
            <span className="shrink-0 text-2xs text-muted-foreground @max-xs:hidden">
              {formatGitGraphShortDate(item.timestamp)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}
