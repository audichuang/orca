// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { Suspense, type ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ImageDiffViewer } from '../../editor-lazy-views'
import { DiffSectionBody } from './DiffSectionBody'

vi.mock('../large-files/ImageDiffViewer', () => ({
  default: () => <div data-testid="image-diff" />
}))
vi.mock('@monaco-editor/react', () => ({ DiffEditor: () => <div data-testid="monaco-diff" /> }))
vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))

const props: ComponentProps<typeof DiffSectionBody> = {
  section: {
    key: 'unstaged:z.png',
    path: 'z.png',
    status: 'modified',
    originalContent: '',
    modifiedContent: '',
    collapsed: false,
    loading: false,
    dirty: false,
    diffResult: {
      kind: 'binary',
      originalContent: 'b3JpZ2luYWw=',
      modifiedContent: 'bW9kaWZpZWQ=',
      originalIsBinary: true,
      modifiedIsBinary: true,
      isImage: true,
      mimeType: 'image/png'
    },
    largeDiffRenderLimit: null
  },
  index: 0,
  sectionBodyHeight: 300,
  useIntrinsicImageHeight: false,
  isBranchMode: false,
  sideBySide: true,
  isDark: false,
  language: 'plaintext',
  modelPathBase: 'image-lazy-identity',
  isEditable: false,
  typography: {
    fontFamily: 'monospace',
    cssFontFamily: 'monospace',
    fontSize: 13,
    fontWeight: 'normal',
    lineHeight: 0,
    fontLigatures: false
  },
  onRetrySection: vi.fn(),
  onLoadDeferredSection: vi.fn(),
  onSaveLimitedDiff: vi.fn(),
  onMount: vi.fn()
}

afterEach(() => {
  cleanup()
})

describe('DiffSectionBody image diff (fork)', () => {
  it('reuses the editor-wide ImageDiffViewer lazy identity, so a loaded chunk renders without suspending', async () => {
    // Load the chunk through the shared lazy export the editor's other surfaces use.
    render(
      <Suspense fallback={null}>
        <ImageDiffViewer
          originalContent=""
          modifiedContent=""
          filePath="warm.png"
          mimeType="image/png"
          sideBySide
        />
      </Suspense>
    )
    await screen.findByTestId('image-diff')
    cleanup()

    // Why: a second lazy wrapper over the same module suspends again, a separate boundary that remounts the row.
    render(<DiffSectionBody {...props} />)
    expect(screen.queryByTestId('image-diff')).not.toBeNull()
  })
})
