// @vitest-environment happy-dom
import { act, cleanup, render, screen } from '@testing-library/react'
import {
  Component,
  Fragment,
  StrictMode,
  Suspense,
  type ComponentProps,
  type ReactNode
} from 'react'
import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js'
import { loader } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import { DiffSectionBody } from './DiffSectionBody'

vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))

// Happy DOM has no canvas adapter; drawing does not participate in this test.
const canvasContext = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'getContext')!
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  configurable: true,
  value: () => ({
    clearRect() {},
    fillRect() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {}
  })
})
afterAll(() => Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', canvasContext))

// oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the wrapper's loader type is a narrower Monaco typing of the same module.
loader.config({ monaco: monaco as never })

let boundaryErrors: unknown[] = []
let windowErrors: unknown[] = []
let suspended: Promise<void> | null = null

const onWindowError = (event: ErrorEvent) => {
  windowErrors.push(event.error)
  event.preventDefault()
}

beforeEach(() => {
  boundaryErrors = []
  windowErrors = []
  window.addEventListener('error', onWindowError)
})

afterEach(async () => {
  cleanup()
  // Why: the deferred editor dispose lands in a microtask; models must outlive it.
  await new Promise((resolve) => setTimeout(resolve, 10))
  monaco.editor.getModels().forEach((model) => model.dispose())
  window.removeEventListener('error', onWindowError)
  suspended = null
})

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown) {
    boundaryErrors.push(error)
  }
  render() {
    return this.state.failed ? <div data-testid="crashed" /> : this.props.children
  }
}

function Suspender(): null {
  if (suspended) {
    throw suspended
  }
  return null
}

const textSection: ComponentProps<typeof DiffSectionBody>['section'] = {
  key: 'a.ts',
  path: 'a.ts',
  status: 'modified',
  originalContent: 'const a = 1\n',
  modifiedContent: 'const a = 2\n',
  collapsed: false,
  loading: false,
  dirty: false,
  diffResult: null,
  largeDiffRenderLimit: null
}

it.each([
  ['StrictMode', StrictMode],
  ['no StrictMode', Fragment]
])(
  'keeps the real Monaco diff editor alive across a Suspense reveal (%s)',
  async (_name, Wrapper) => {
    const mounted: editor.IStandaloneDiffEditor[] = []
    // Why: a fresh element per call, otherwise React bails out and the sibling never re-suspends.
    const tree = () => (
      <Wrapper>
        <Boundary>
          <Suspense fallback={<div data-testid="outer-fallback" />}>
            <DiffSectionBody
              section={textSection}
              index={0}
              sectionBodyHeight={200}
              useIntrinsicImageHeight={false}
              isBranchMode={false}
              sideBySide
              isDark={false}
              language="typescript"
              modelPathBase="diff:a"
              isEditable={false}
              diffEditorFontSize={12}
              onRetrySection={() => {}}
              onLoadDeferredSection={() => {}}
              onSaveLimitedDiff={() => {}}
              onMount={(diffEditor) => mounted.push(diffEditor)}
            />
            <Suspender />
          </Suspense>
        </Boundary>
      </Wrapper>
    )
    const view = render(tree())
    // Why: disposing mid-computation makes Monaco reject its pending diff with an unrelated Canceled.
    await vi.waitFor(() => {
      expect(mounted.length).toBeGreaterThan(0)
      expect(mounted[0].getLineChanges()).not.toBeNull()
    })

    // A sibling suspends and resolves: React disconnects then reconnects the editor's effects.
    let resume: () => void = () => {}
    suspended = new Promise<void>((resolve) => (resume = resolve))
    view.rerender(tree())
    await act(async () => {
      suspended = null
      resume()
      await new Promise((resolve) => setTimeout(resolve, 50))
    })

    expect(boundaryErrors).toEqual([])
    expect(windowErrors).toEqual([])
    expect(screen.queryByTestId('crashed')).toBeNull()
    expect(mounted).toHaveLength(1)
    const model = mounted[0].getModel()
    expect(model?.original.uri.toString(true)).toBe('diff:a:original')
    expect(model?.modified.uri.toString(true)).toBe('diff:a:modified')
  }
)
