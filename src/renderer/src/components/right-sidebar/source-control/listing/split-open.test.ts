import { describe, expect, it } from 'vitest'
import { isSourceControlSplitOpenModifier, shouldOpenSourceControlRowAsPreview } from './split-open'
import { SOURCE_CONTROL_OPEN_TO_SIDE_EVENT } from './split-open-to-side'

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
