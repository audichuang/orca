// @vitest-environment happy-dom
// Fork seam guard: both the wide and the narrow (<=600px) toast offsets clear registered bottom chrome.
import { act } from 'react'
import { cleanup, render } from '@testing-library/react'
import { toast } from 'sonner'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TOAST_BOTTOM_CLEARANCE_VAR } from '@/lib/toast-bottom-clearance'
import { Toaster } from './sonner'

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: { settings: { theme: string } }) => unknown) =>
    selector({ settings: { theme: 'light' } })
}))

afterEach(() => {
  act(() => toast.dismiss())
  cleanup()
})

describe('Toaster bottom offsets', () => {
  it('lifts toasts above registered bottom chrome on wide and narrow windows', async () => {
    const { container } = render(<Toaster />)
    act(() => {
      toast('copied')
    })
    const toaster = await vi.waitFor(() => {
      const element = container.querySelector<HTMLElement>('[data-sonner-toaster]')
      expect(element).not.toBeNull()
      return element
    })
    const clearance = `var(${TOAST_BOTTOM_CLEARANCE_VAR}, 0px)`
    expect(toaster?.style.getPropertyValue('--offset-bottom')).toContain(clearance)
    expect(toaster?.style.getPropertyValue('--mobile-offset-bottom')).toContain(clearance)
  })
})
