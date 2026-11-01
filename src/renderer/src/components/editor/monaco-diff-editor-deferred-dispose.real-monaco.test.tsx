// @vitest-environment happy-dom
import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js'
import { errorHandler } from 'monaco-editor/esm/vs/base/common/errors.js'
import { deferDiffEditorDispose } from './monaco-diff-editor-deferred-dispose'

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

const previousHandler = errorHandler.unexpectedErrorHandler
let monacoErrors: unknown[] = []
let host: HTMLDivElement

beforeEach(() => {
  monacoErrors = []
  // Why: the default handler rethrows from a timer, so capturing makes the assertion deterministic.
  errorHandler.unexpectedErrorHandler = (error: unknown) => {
    monacoErrors.push(error)
  }
  host = document.createElement('div')
  document.body.append(host)
})

afterEach(() => {
  errorHandler.unexpectedErrorHandler = previousHandler
  document.body.replaceChildren()
})

async function createEditorWithModels() {
  const editor = monaco.editor.createDiffEditor(host, {
    automaticLayout: false,
    dimension: { width: 1000, height: 400 }
  })
  const original = monaco.editor.createModel('const a = 1\n')
  const modified = monaco.editor.createModel('const a = 2\n')
  editor.setModel({ original, modified })
  // Why: disposing mid-computation makes Monaco reject its pending diff with an unrelated Canceled.
  await vi.waitFor(() => expect(editor.getLineChanges()).not.toBeNull())
  return { editor, original, modified }
}

async function flushMicrotasksAndTimers() {
  await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
}

it('does not report an unexpected Monaco error when models are disposed in the same flush', async () => {
  const { editor, original, modified } = await createEditorWithModels()
  deferDiffEditorDispose(editor)

  editor.dispose()
  original.dispose()
  modified.dispose()
  await flushMicrotasksAndTimers()

  expect(monacoErrors).toEqual([])
})

it('keeps the editor usable when a StrictMode reconnect cancels the pending dispose', async () => {
  const { editor, original, modified } = await createEditorWithModels()
  const cancel = deferDiffEditorDispose(editor)

  editor.dispose()
  cancel()
  editor.setModel({ original, modified })
  await flushMicrotasksAndTimers()

  const attached = editor.getModel()
  expect(attached?.original).toBe(original)
  expect(attached?.modified).toBe(modified)
  expect(original.isDisposed()).toBe(false)
  expect(modified.isDisposed()).toBe(false)
  expect(monacoErrors).toEqual([])

  editor.dispose()
  await flushMicrotasksAndTimers()
  original.dispose()
  modified.dispose()
})
