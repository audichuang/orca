import type { GitHistoryItem } from '../../../../../../shared/git-history'
import type { GitBranchChangeEntry } from '../../../../../../shared/git-diff-compare-types'
import type { GitHistoryCommitFilesState } from './git-history-commit-files'
import type { CommitFileTarget } from './commit-file-sequence'

type MergedCommitFiles = {
  state: GitHistoryCommitFilesState
  /** What a merged row diffs: from before its oldest selected change to after its newest. */
  targetByPath: ReadonlyMap<string, CommitFileTarget>
}

function mergeEntry(
  headEntry: GitBranchChangeEntry,
  baseEntry: GitBranchChangeEntry
): GitBranchChangeEntry {
  if (headEntry === baseEntry) {
    return headEntry
  }
  // The diff's left side is the path as it was before the oldest selected change.
  const leftPath = baseEntry.oldPath ?? baseEntry.path
  const renamed = leftPath !== headEntry.path
  // Line counts belong to one commit, so a merged row drops them rather than show one commit's.
  const created = baseEntry.status === 'added' || baseEntry.status === 'copied'
  if (created && headEntry.status === 'deleted') {
    // Why no oldPath: the path did not exist on either side, so a copy source must not show as deleted content.
    return { path: headEntry.path, status: 'deleted' }
  }
  if (baseEntry.status === 'added') {
    return { path: headEntry.path, status: 'added' }
  }
  if (baseEntry.status === 'copied') {
    // A copy's source still exists, so the row stays a copy rather than reading as a rename.
    return { path: headEntry.path, status: 'copied', oldPath: leftPath }
  }
  return {
    path: headEntry.path,
    status: renamed && headEntry.status !== 'deleted' ? 'renamed' : headEntry.status,
    ...(renamed ? { oldPath: leftPath } : {})
  }
}

/** Union of the commits' files, newest first (graph order), each spanning all its selected changes like IntelliJ. */
export function mergeCommitFiles(
  items: readonly GitHistoryItem[],
  filesByCommit: Readonly<Record<string, GitHistoryCommitFilesState>>
): MergedCommitFiles {
  const spans = new Map<
    string,
    {
      head: GitHistoryItem
      headEntry: GitBranchChangeEntry
      base: GitHistoryItem
      baseEntry: GitBranchChangeEntry
    }
  >()
  // Why: a rename in a newer commit makes older changes to its old path part of the same row.
  const spanKeyByOlderPath = new Map<string, string>()
  let loading = false
  for (const item of items) {
    const files = filesByCommit[item.id]
    if (files?.status === 'error') {
      return { state: files, targetByPath: new Map() }
    }
    if (files?.status !== 'ready') {
      loading = true
      continue
    }
    const renamesInCommit: [string, string][] = []
    const createdInCommit: string[] = []
    for (const entry of files.entries) {
      const key = spanKeyByOlderPath.get(entry.path) ?? entry.path
      const span = spans.get(key)
      if (span) {
        span.base = item
        span.baseEntry = entry
      } else {
        spans.set(key, { head: item, headEntry: entry, base: item, baseEntry: entry })
      }
      // Copies keep their source alive as its own file; only a rename continues its history.
      if (entry.status === 'renamed' && entry.oldPath) {
        renamesInCommit.push([entry.oldPath, key])
      }
      if (entry.status !== 'modified' && entry.status !== 'deleted') {
        createdInCommit.push(entry.path)
      }
    }
    // Why: a path this commit brought into being names a different file in older commits.
    for (const path of createdInCommit) {
      spanKeyByOlderPath.delete(path)
    }
    // Why after the loop: the old path names an older file only for older commits, not this one.
    for (const [oldPath, key] of renamesInCommit) {
      spanKeyByOlderPath.set(oldPath, key)
    }
  }
  const targetByPath = new Map<string, CommitFileTarget>()
  for (const [path, span] of spans) {
    targetByPath.set(path, {
      entry: mergeEntry(span.headEntry, span.baseEntry),
      head: span.head,
      base: span.base
    })
  }
  const entries = Array.from(targetByPath.values(), (target) => target.entry)
  return { state: loading ? { status: 'loading' } : { status: 'ready', entries }, targetByPath }
}
