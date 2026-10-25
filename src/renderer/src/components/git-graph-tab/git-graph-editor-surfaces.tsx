// Fork-only: how upstream editor-tab sites draw the fork's editor tab kinds (the Git Graph tab).

import { GitGraph, type LucideIcon } from 'lucide-react'
import type { OpenFile } from '@/store/slices/editor'
import type { EditorHeaderCopyState } from '@/components/editor/editor-header'
import { lazyWithRetry } from '@/lib/lazy-with-retry'

const GitGraphTabView = lazyWithRetry(() => import('./GitGraphTabView'))

/** The editor body for a fork tab kind; null leaves the file to upstream's surfaces. */
export function forkEditorTabView(file: OpenFile): React.JSX.Element | null {
  return file.mode === 'git-graph' ? <GitGraphTabView file={file} /> : null
}

/** Tab icon for a fork kind, given as an open file's mode or a tab content type. */
export function forkEditorTabIcon(kind: string): LucideIcon | null {
  return kind === 'git-graph' ? GitGraph : null
}

export function forkEditorTabIconElement(
  kind: string,
  className: string
): React.JSX.Element | null {
  return kind === 'git-graph' ? <GitGraph className={className} /> : null
}

/** The Git Graph tab's path is a synthetic id, so it copies nothing and shows its label. */
export function forkEditorHeaderCopyState(file: OpenFile): EditorHeaderCopyState | null {
  if (file.mode !== 'git-graph') {
    return null
  }
  return {
    copyText: null,
    copyToastLabel: file.relativePath,
    pathLabel: file.relativePath,
    pathTitle: file.relativePath
  }
}
