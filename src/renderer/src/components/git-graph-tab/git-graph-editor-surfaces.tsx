// Fork-only: the fork's Git Graph view draws upstream's `git-graph` editor tabs.

import type { OpenFile } from '@/store/slices/editor/types/open-file'
import { lazyWithRetry } from '@/lib/lazy-with-retry'

const GitGraphTabView = lazyWithRetry(() => import('./GitGraphTabView'))

/** The editor body for a Git Graph tab; null leaves the file to upstream's surfaces. */
export function forkEditorTabView(file: OpenFile): React.JSX.Element | null {
  return file.mode === 'git-graph' ? <GitGraphTabView file={file} /> : null
}
