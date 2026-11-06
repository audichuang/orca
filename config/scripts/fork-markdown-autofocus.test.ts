// @vitest-environment happy-dom

import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { afterEach, expect, it, vi } from 'vitest'
import { autoFocusRichEditor } from '../../src/renderer/src/components/editor/rich-markdown/instance/rich-markdown-auto-focus'

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

it.each([false, true])(
  'preserves typing across deferred autofocus (explicit handoff: %s)',
  (force) => {
    const root = document.createElement('div')
    document.body.append(root)
    const editor = new Editor({ element: root, extensions: [StarterKit], content: '<p></p>' })
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback)
      return frames.length
    })

    try {
      autoFocusRichEditor(editor, root, force)
      if (!force) {
        editor.view.dom.focus()
      }
      expect(document.activeElement).toBe(editor.view.dom)
      editor.commands.insertContent('autofocu')
      frames.shift()!(0)
      editor.commands.insertContent('s-1793974147888')
      expect(editor.getText()).toBe('autofocus-1793974147888')
    } finally {
      editor.destroy()
    }
  }
)
