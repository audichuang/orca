// Fork: tree layout for GitHistoryCommitFiles.
import { Fragment, useMemo, useState } from 'react'
import type React from 'react'
import {
  buildSourceControlTree,
  compactSourceControlTree,
  flattenSourceControlTree
} from '../../../../../../shared/source-control/listing/source-control-tree'
import type { GitBranchChangeEntry } from '../../../../../../shared/git/diff/git-diff-compare-types'
import type { BranchSourceControlTreeNode } from '../listing/directory-action-paths'
import { SourceControlBranchTreeDirectoryRow } from '../listing/tree-directory-rows'
import {
  SOURCE_CONTROL_TREE_FILE_PADDING_PX,
  SOURCE_CONTROL_TREE_INDENT_PX
} from '../listing/row-layout'
import type { GitHistoryCommitFilesState } from './git-history-commit-files'

const NO_PATHS: ReadonlySet<string> = new Set()

type RenderFile = (entry: GitBranchChangeEntry, indentPx: number) => React.JSX.Element
export type CommitFilesTreeRows = (renderFile: RenderFile) => React.JSX.Element

function CommitFilesTree({
  roots,
  renderFile
}: {
  roots: readonly BranchSourceControlTreeNode[]
  renderFile: RenderFile
}): React.JSX.Element {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(NO_PATHS)
  const toggle = (key: string): void =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (!next.delete(key)) {
        next.add(key)
      }
      return next
    })
  return (
    <>
      {flattenSourceControlTree(roots, collapsed).map((node) =>
        node.type === 'directory' ? (
          // Why the wrapper: the files menu finds a right-clicked folder by this attribute.
          <div key={node.key} data-commit-dir-path={node.path}>
            <SourceControlBranchTreeDirectoryRow
              node={node}
              isCollapsed={collapsed.has(node.key)}
              onToggle={() => toggle(node.key)}
            />
          </div>
        ) : (
          <Fragment key={node.key}>
            {renderFile(
              node.entry,
              node.depth * SOURCE_CONTROL_TREE_INDENT_PX + SOURCE_CONTROL_TREE_FILE_PADDING_PX
            )}
          </Fragment>
        )
      )}
    </>
  )
}

export function useCommitFilesTreeLayout(
  layout: 'list' | 'tree',
  state: GitHistoryCommitFilesState
): { entries: readonly GitBranchChangeEntry[]; renderRows?: CommitFilesTreeRows } {
  const roots = useMemo(
    () =>
      layout === 'tree' && state.status === 'ready'
        ? compactSourceControlTree(buildSourceControlTree('branch', state.entries))
        : undefined,
    [layout, state]
  )
  // Why tree order: shift-click ranges must follow the rows as shown, not git's path order.
  return useMemo(() => {
    if (roots) {
      return {
        entries: flattenSourceControlTree(roots, NO_PATHS).flatMap((node) =>
          node.type === 'file' ? [node.entry] : []
        ),
        renderRows: (renderFile) => <CommitFilesTree roots={roots} renderFile={renderFile} />
      }
    }
    return { entries: state.status === 'ready' ? state.entries : [] }
  }, [roots, state])
}
