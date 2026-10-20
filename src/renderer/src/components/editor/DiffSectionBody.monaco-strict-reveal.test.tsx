// @vitest-environment happy-dom
import { act, cleanup, render, screen } from '@testing-library/react'
import { StrictMode, Suspense, type ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loader } from '@monaco-editor/react'
import { DiffSectionBody } from './DiffSectionBody'

const { imageChunk } = vi.hoisted(() => {
  let release: () => void = () => {}
  const ready = new Promise<void>((resolve) => {
    release = resolve
  })
  return { imageChunk: { ready, release: () => release() } }
})

vi.mock('./ImageDiffViewer', async () => {
  await imageChunk.ready
  return { default: () => <div data-testid="image-diff" /> }
})
vi.mock('./diff-editor-word-wrap-options', () => ({
  buildDiffEditorWordWrapOptions: () => ({}),
  syncDiffEditorOriginalWordWrap: () => ({ dispose: () => {} })
}))
vi.mock('./diff-editor-shift-wheel-scroll', () => ({
  installDiffEditorShiftWheelScroll: () => () => {}
}))
vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))

type FakeModel = { uri: string; dispose: () => void; setValue: () => void }

// Mirrors the Monaco behavior behind the crash: a disposed editor throws when given a model.
function createFakeMonaco() {
  const models = new Map<string, FakeModel>()
  const events: string[] = []
  const editors: { getModel: () => FakeModel | null }[] = []
  const createCodeEditor = () => {
    let disposed = false
    let model: FakeModel | null = null
    const disposeListeners = new Set<() => void>()
    return {
      dispose: () => {
        if (disposed) {
          return
        }
        disposed = true
        // Real Monaco detaches the model on dispose, so getModel() is null afterwards.
        model = null
        disposeListeners.forEach((listener) => listener())
      },
      getModel: () => model,
      setModel: (next: FakeModel) => {
        if (disposed) {
          throw new Error('InstantiationService has been disposed')
        }
        model = next
      },
      onDidDispose: (listener: () => void) => {
        disposeListeners.add(listener)
        return { dispose: () => disposeListeners.delete(listener) }
      },
      getOption: () => true,
      setValue: () => {},
      getValue: () => ''
    }
  }
  const monaco = {
    Uri: { parse: (path: string) => path },
    editor: {
      EditorOption: { readOnly: 0 },
      getModel: (uri: string) => models.get(uri) ?? null,
      createModel: (_value: string, _language: string, uri: string) => {
        const model = { uri, dispose: () => models.delete(uri), setValue: () => {} }
        models.set(uri, model)
        return model
      },
      setTheme: () => {},
      setModelLanguage: () => {},
      createDiffEditor: () => {
        const original = createCodeEditor()
        const modified = createCodeEditor()
        events.push('create')
        editors.push(original)
        return {
          getOriginalEditor: () => original,
          getModifiedEditor: () => modified,
          getModel: () => ({ original: original.getModel(), modified: modified.getModel() }),
          setModel: (next: { original: FakeModel; modified: FakeModel }) => {
            original.setModel(next.original)
            modified.setModel(next.modified)
          },
          updateOptions: () => {},
          dispose: () => {
            events.push('dispose')
            original.dispose()
            modified.dispose()
          }
        }
      }
    }
  }
  return { monaco, events, editors }
}

const textSection: ComponentProps<typeof DiffSectionBody>['section'] = {
  key: 'README.md',
  path: 'README.md',
  status: 'modified',
  originalContent: 'original',
  modifiedContent: 'modified',
  collapsed: false,
  loading: false,
  dirty: false,
  diffResult: null,
  largeDiffRenderLimit: null
}

function body(overrides: Partial<ComponentProps<typeof DiffSectionBody>> = {}) {
  return (
    <DiffSectionBody
      section={textSection}
      index={0}
      sectionBodyHeight={100}
      useIntrinsicImageHeight={false}
      isBranchMode={false}
      sideBySide
      isDark={false}
      language="markdown"
      modelPathBase="diff:a"
      isEditable={false}
      diffEditorFontSize={12}
      onRetrySection={() => {}}
      onLoadDeferredSection={() => {}}
      onSaveLimitedDiff={() => {}}
      onMount={() => {}}
      {...overrides}
    />
  )
}

let suspended: Promise<void> | null = null
function Suspender(): null {
  if (suspended) {
    throw suspended
  }
  return null
}

// The loader keeps the first configured Monaco, so every test shares one fake.
const fake = createFakeMonaco()
// oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the fake covers every Monaco API the wrapper and body call here.
loader.config({ monaco: fake.monaco as never })

const flush = () => act(async () => await new Promise((resolve) => setTimeout(resolve, 10)))

afterEach(() => {
  cleanup()
  suspended = null
  fake.events.length = 0
  fake.editors.length = 0
})

describe('DiffSectionBody Monaco lifecycle', () => {
  it('keeps the diff editor alive when a Suspense reveal reconnects effects under StrictMode', async () => {
    const onMount = vi.fn()
    const tree = (modelPathBase: string) => (
      <StrictMode>
        <Suspense fallback={<div data-testid="outer-fallback" />}>
          {body({ modelPathBase, onMount })}
          <Suspender />
        </Suspense>
      </StrictMode>
    )
    const view = render(tree('diff:a'))
    await flush()
    expect(fake.events).toEqual(['create'])

    // A sibling suspends and resolves: React disconnects then reconnects the editor's effects.
    let resume: () => void = () => {}
    suspended = new Promise<void>((resolve) => (resume = resolve))
    view.rerender(tree('diff:a'))
    await act(async () => {
      suspended = null
      resume()
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
    expect(fake.events).toEqual(['create'])
    expect(onMount).toHaveBeenCalledTimes(1)

    // The combined diff recycles the row for another file, which changes the model path.
    view.rerender(tree('diff:b'))
    await flush()
    expect(fake.events).toEqual(['create'])
    expect(fake.editors.at(-1)?.getModel()?.uri).toBe('diff:b:original')

    view.unmount()
    await flush()
    expect(fake.events).toEqual(['create', 'dispose'])
  })

  it('loads an image section chunk without suspending the sibling editors', async () => {
    const imageSection = {
      ...textSection,
      key: 'logo.png',
      path: 'logo.png',
      diffResult: {
        kind: 'binary' as const,
        isImage: true,
        originalContent: '',
        modifiedContent: 'iVBORw0KGgo=',
        mimeType: 'image/png',
        originalIsBinary: false,
        modifiedIsBinary: true as const
      }
    }
    const tree = (imageLoaded: boolean) => (
      <StrictMode>
        <Suspense fallback={<div data-testid="outer-fallback" />}>
          {body()}
          {body({
            index: 1,
            modelPathBase: 'diff:logo',
            section: imageLoaded ? imageSection : { ...imageSection, loading: true }
          })}
        </Suspense>
      </StrictMode>
    )
    const view = render(tree(false))
    await flush()
    expect(fake.events).toEqual(['create'])

    view.rerender(tree(true))
    expect(screen.queryByTestId('outer-fallback')).toBeNull()
    await act(async () => {
      imageChunk.release()
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
    expect(await screen.findByTestId('image-diff')).toBeTruthy()
    expect(fake.events).toEqual(['create'])
  })
})
