import { renderToStaticMarkup } from 'react-dom/server'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { OpenFile } from '@/store/slices/editor'
import type { DiffDirection } from './diff-change-boundary'
import { EditorPanelHeader } from './EditorPanelHeader'

const navigation = vi.hoisted((): { hint: DiffDirection | null } => ({ hint: null }))

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ activeGroupIdByWorktree: {}, settings: {}, updateSettings: vi.fn() })
}))
vi.mock('@/store/worktree-diff-comments-selector', () => ({
  selectWorktreeDiffCommentsOrEmpty: () => []
}))
vi.mock('./EditorPanelHeaderPath', () => ({ EditorPanelHeaderPath: () => null }))
vi.mock('./EditorPanelActionsMenu', () => ({ EditorPanelActionsMenu: () => null }))
vi.mock('./diff-navigation-context', () => ({
  useDiffNavigation: () => ({
    changeCount: 2,
    goToPreviousDiff: vi.fn(),
    goToNextDiff: vi.fn(),
    filePosition: { index: 2, total: 6 },
    fileBoundaryHint: navigation.hint
  })
}))

const activeFile: OpenFile = {
  id: 'diff:/repo/file.ts',
  filePath: '/repo/file.ts',
  relativePath: 'file.ts',
  worktreeId: 'repo::/repo',
  language: 'typescript',
  isDirty: false,
  mode: 'diff',
  diffSource: 'unstaged'
}

const props = {
  activeFile,
  copiedPathVisible: false,
  isSingleDiff: true,
  isDiffSurface: true,
  isMarkdown: false,
  isCsv: false,
  isNotebook: false,
  hasEditorToggle: false,
  availableEditorToggleModes: [],
  effectiveToggleValue: 'edit',
  canOpenPreviewToSide: false,
  canShowMarkdownPreview: false,
  canShowMarkdownTableOfContents: false,
  isMarkdownTableOfContentsDisabled: false,
  shouldShowMarkdownExportAction: false,
  canExportMarkdownToPdf: false,
  showMarkdownTableOfContents: false,
  canShowMarkdownFrontmatterToggle: false,
  markdownFrontmatterVisible: false,
  sideBySide: false,
  openFileState: { canOpen: false },
  onCopyPath: vi.fn(),
  onOpenDiffTargetFile: vi.fn(),
  onOpenPreviewToSide: vi.fn(),
  onOpenMarkdownPreview: vi.fn(),
  onToggleSideBySide: vi.fn(),
  onEditorToggleChange: vi.fn(),
  onToggleMarkdownTableOfContents: vi.fn(),
  onToggleMarkdownFrontmatter: vi.fn(),
  onExportMarkdownToPdf: vi.fn()
} satisfies ComponentProps<typeof EditorPanelHeader>

describe('EditorPanelHeader diff file sequence', () => {
  it('shows the file position beside the change arrows, then the press-again hint', () => {
    navigation.hint = null
    expect(renderToStaticMarkup(<EditorPanelHeader {...props} />)).toContain('3/6 files')
    navigation.hint = 'next'
    expect(renderToStaticMarkup(<EditorPanelHeader {...props} />)).toContain(
      'Press again to go to the next file'
    )
  })
})
