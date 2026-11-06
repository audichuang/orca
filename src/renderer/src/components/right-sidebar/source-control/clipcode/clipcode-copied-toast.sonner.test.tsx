// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { Toaster, toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { notifyClipcodeCopied } from './clipcode-copied-toast'

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string, values?: Record<string, string | number>) =>
    fallback.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => String(values?.[name] ?? ''))
}))

// Why 10ms frames: React flushes sonner's effects (which start its exit timers) when each act ends.
async function settle(ms: number): Promise<void> {
  for (let elapsed = 0; elapsed < ms; elapsed += 10) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10)
    })
  }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Copy Full Source toast', () => {
  it('replaces the previous copy toast instead of stacking over the source-control rows', async () => {
    render(<Toaster />)
    notifyClipcodeCopied('1 Git file(s) copied', [], 'a\n')
    await settle(50)
    notifyClipcodeCopied('2 Git file(s) copied', [], 'b\nc\n')
    await settle(50)
    notifyClipcodeCopied('3 Git file(s) copied', [], 'd\ne\nf\n')
    // Why 400ms: a dismissed toast leaves after sonner's 200ms exit animation.
    await settle(400)

    const toasts = document.querySelectorAll('[data-sonner-toast]')
    expect(toasts).toHaveLength(1)
    expect(toasts[0]?.textContent).toContain('3 Git file(s) copied')
  })

  it('still shows a copy made while the previous copy toast is leaving', async () => {
    render(<Toaster />)
    notifyClipcodeCopied('1 Git file(s) copied', [], 'a\n')
    await settle(50)
    toast.dismiss()
    // Why 50ms: past the frame where sonner marks the dismissed toast, inside its 200ms exit.
    await settle(50)
    notifyClipcodeCopied('2 Git file(s) copied', [], 'b\nc\n')
    await settle(400)

    const toasts = document.querySelectorAll('[data-sonner-toast]')
    expect(toasts).toHaveLength(1)
    expect(toasts[0]?.textContent).toContain('2 Git file(s) copied')
  })
})
