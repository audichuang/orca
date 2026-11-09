// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import {
  askClipcodeNonTextChoice,
  ClipcodeNonTextCopyDialogHost
} from './clipcode-non-text-copy-dialog'

afterEach(cleanup)

const summary = {
  count: 1,
  totalBytes: 4096,
  files: [{ path: 'img/logo.png', size: 4096 }],
  includePayloadBytes: 6000,
  unreadOverLimitCount: 0
}

describe('ClipcodeNonTextCopyDialogHost', () => {
  it('resolves the pressed button and starts on Include', async () => {
    render(<ClipcodeNonTextCopyDialogHost />)
    let choice: Promise<string> = Promise.resolve('')
    act(() => {
      choice = askClipcodeNonTextChoice(summary)
    })
    expect(screen.getByRole('button', { name: 'Include' })).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: 'Include' }))
    await expect(choice).resolves.toBe('include')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('cancels on Escape so nothing is copied', async () => {
    render(<ClipcodeNonTextCopyDialogHost />)
    let choice: Promise<string> = Promise.resolve('')
    act(() => {
      choice = askClipcodeNonTextChoice(summary)
    })
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    await expect(choice).resolves.toBe('cancel')
  })

  it('disables Include over the 50 MiB clipboard limit and starts on Exclude', async () => {
    render(<ClipcodeNonTextCopyDialogHost />)
    let choice: Promise<string> = Promise.resolve('')
    act(() => {
      choice = askClipcodeNonTextChoice({
        ...summary,
        totalBytes: 40 * 1024 * 1024,
        includePayloadBytes: 50 * 1024 * 1024 + 1
      })
    })
    expect(screen.getByRole('button', { name: 'Include' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Exclude' })).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: 'Exclude' }))
    await expect(choice).resolves.toBe('exclude')
  })
})
