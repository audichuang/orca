import { renderToStaticMarkup } from 'react-dom/server'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { OpenFile } from '@/store/slices/editor'
import type { DiffDirection } from './diff-change-boundary'
import { EditorPanelHeader } from './EditorPanelHeader'

const navigation = vi.hoisted((): { hint: DiffDirection | null; changeCount: number } => ({
  hint: null,
  changeCount: 2
}))

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ activeGroupIdByWorktree: {}, settings: {}, updateSettings: vi.fn() })
}))
vi.mock('@/store/worktree-diff-comments-selector', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  selectWorktreeDiffCommentsOrEmpty: () => []
}))
vi.mock('./EditorPanelHeaderPath', () => ({ EditorPanelHeaderPath: () => null }))
vi.mock('./EditorPanelActionsMenu', () => ({ EditorPanelActionsMenu: () => null }))
vi.mock('./diff/review/diff-navigation-context', () => ({
  useDiffNavigation: () => ({
    changeCount: navigation.changeCount,
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

describe('EditorPanelHeader change arrows in a diff file list', () => {
  it('keeps the arrows enabled on an unchanged file so they can step to its neighbours', () => {
    navigation.hint = null
    navigation.changeCount = 0
    try {
      const markup = renderToStaticMarkup(<EditorPanelHeader {...props} />)
      expect(markup).toContain('aria-label="Previous change"')
      expect(markup).toContain('aria-label="Next change"')
      expect(markup).not.toMatch(/<button[^>]*disabled=""[^>]*aria-label="(Previous|Next) change"/)
      expect(markup).not.toMatch(/<button[^>]*aria-label="(Previous|Next) change"[^>]*disabled=""/)
    } finally {
      navigation.changeCount = 2
    }
  })
})
