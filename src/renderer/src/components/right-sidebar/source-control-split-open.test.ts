import { describe, expect, it } from 'vitest'
import {
  isSourceControlSplitOpenModifier,
  shouldOpenSourceControlRowAsPreview,
  toPermanentSourceControlRowOpenEvent,
  type SourceControlRowOpenEvent
} from './source-control/listing/split-open'

function event(overrides: Partial<SourceControlRowOpenEvent> = {}): SourceControlRowOpenEvent {
  return {
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...overrides
  }
}

describe('isSourceControlSplitOpenModifier', () => {
  it('only Alt/Option opens a split', () => {
    expect(isSourceControlSplitOpenModifier(event({ altKey: true }))).toBe(true)
  })

  it('leaves Ctrl, Cmd and Shift for multi-selection', () => {
    expect(isSourceControlSplitOpenModifier(event({ ctrlKey: true }))).toBe(false)
    expect(isSourceControlSplitOpenModifier(event({ metaKey: true }))).toBe(false)
    expect(isSourceControlSplitOpenModifier(event({ shiftKey: true }))).toBe(false)
  })

  it('ignores a plain click', () => {
    expect(isSourceControlSplitOpenModifier(event())).toBe(false)
  })
})

describe('shouldOpenSourceControlRowAsPreview', () => {
  it('uses preview for plain row opens in the current group', () => {
    expect(shouldOpenSourceControlRowAsPreview(event(), undefined)).toBe(true)
  })

  it('does not preview when opening into a split group', () => {
    expect(shouldOpenSourceControlRowAsPreview(event(), 'group-2')).toBe(false)
  })

  it('does not preview when the row requests a permanent open', () => {
    expect(shouldOpenSourceControlRowAsPreview(event({ openAsPermanent: true }), undefined)).toBe(
      false
    )
  })
})

describe('toPermanentSourceControlRowOpenEvent', () => {
  it('preserves modifier keys and marks the row open as permanent', () => {
    expect(
      toPermanentSourceControlRowOpenEvent(
        event({
          altKey: true,
          metaKey: true
        })
      )
    ).toEqual({
      altKey: true,
      ctrlKey: false,
      metaKey: true,
      shiftKey: false,
      openAsPermanent: true
    })
  })
})
