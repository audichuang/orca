import { describe, expect, it } from 'vitest'
import { isSourceControlSplitOpenModifier, shouldOpenSourceControlRowAsPreview } from './split-open'
import { SOURCE_CONTROL_OPEN_TO_SIDE_EVENT } from './split-open-to-side'

describe('isSourceControlSplitOpenModifier', () => {
  it.each([
    { key: 'altKey', split: true },
    { key: 'ctrlKey', split: false },
    { key: 'metaKey', split: false },
    { key: 'shiftKey', split: false }
  ])('opens a split with $key alone: $split', ({ key, split }) => {
    expect(
      isSourceControlSplitOpenModifier({
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
        [key]: true
      })
    ).toBe(split)
  })
})

describe('Open to the Side event', () => {
  it('is a split open, same as Alt-click, and never a plain-click preview-open', () => {
    expect(isSourceControlSplitOpenModifier(SOURCE_CONTROL_OPEN_TO_SIDE_EVENT)).toBe(true)
    expect(
      isSourceControlSplitOpenModifier({
        altKey: false,
        ctrlKey: true,
        metaKey: true,
        shiftKey: true
      })
    ).toBe(false)
    expect(shouldOpenSourceControlRowAsPreview(SOURCE_CONTROL_OPEN_TO_SIDE_EVENT, undefined)).toBe(
      false
    )
  })
})
