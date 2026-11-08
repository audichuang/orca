import { describe, expect, it, vi } from 'vitest'
import { syncKeptModelValue } from './diff-kept-model-sync'

function fakeModel(value: string) {
  const range = { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }
  return {
    getValue: () => value,
    getFullModelRange: () => range,
    pushEditOperations: vi.fn()
  }
}

describe('syncKeptModelValue', () => {
  it('replaces stale kept content with one undoable edit', () => {
    const model = fakeModel('old')
    expect(syncKeptModelValue(model, 'new')).toBe(true)
    expect(model.pushEditOperations).toHaveBeenCalledWith(
      null,
      [{ range: model.getFullModelRange(), text: 'new' }],
      expect.any(Function)
    )
  })

  it('leaves an up-to-date or missing model alone', () => {
    const model = fakeModel('same')
    expect(syncKeptModelValue(model, 'same')).toBe(false)
    expect(model.pushEditOperations).not.toHaveBeenCalled()
    expect(syncKeptModelValue(null, 'x')).toBe(false)
  })
})
