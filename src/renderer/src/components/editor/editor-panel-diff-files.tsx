// Fork: EditorPanel's git owner and cross-file diff navigation, kept here so EditorPanel.tsx stays within max-lines.
import { getOpenFileGitWorktreeId } from '@/store/slices/editor/git/open-file-git-owner'
import type { OpenFile } from '@/store/slices/editor/types/open-file'
import { DiffNavigationProvider } from './diff/review/diff-navigation-context'
import { useDiffFilePosition } from './diff-file-sequence'

export function panelGitWorktreeId(file: OpenFile | null): string | undefined {
  return file ? getOpenFileGitWorktreeId(file) : undefined
}

export function DiffFileNavigationProvider({
  file,
  viewStateId,
  children
}: {
  file: OpenFile | null
  viewStateId: string | null
  children: React.ReactNode
}): React.JSX.Element {
  const filePosition = useDiffFilePosition(file, viewStateId)
  return <DiffNavigationProvider filePosition={filePosition}>{children}</DiffNavigationProvider>
}
