// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { Toaster } from 'sonner'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { notifyClipcodeCopied } from './clipcode-copied-toast'

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string, values?: Record<string, string | number>) =>
    fallback.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => String(values?.[name] ?? ''))
}))

async function settle(ms: number): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms))
  })
}

afterEach(() => {
  cleanup()
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
})
