// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DiffSectionBody } from './DiffSectionBody'

// Fork: the image diff uses the editor's shared lazy identity, not a second local lazy wrapper.
vi.mock('../../editor-lazy-views', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ImageDiffViewer: () => <div data-testid="shared-image-diff" />
}))
vi.mock('../large-files/ImageDiffViewer', () => ({
  default: () => <div data-testid="local-image-diff" />
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
  it('renders the shared ImageDiffViewer from editor-lazy-views', async () => {
    render(<DiffSectionBody {...props} />)

    expect(await screen.findByTestId('shared-image-diff')).toBeTruthy()
    expect(screen.queryByTestId('local-image-diff')).toBeNull()
  })
})
