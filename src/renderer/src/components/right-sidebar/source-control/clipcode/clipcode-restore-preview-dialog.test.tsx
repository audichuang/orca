// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { ClipcodeRestorePreviewDialog } from './clipcode-restore-preview-dialog'
import type { ParsedEntry } from './clipcode-clipboard-format'

afterEach(cleanup)

const entries: ParsedEntry[] = [
  { path: 'new.ts', content: 'n', changeTypes: new Set(['NEW']) },
  { path: 'old.ts', content: 'o', changeTypes: new Set(['MODIFIED']) }
]

describe('ClipcodeRestorePreviewDialog', () => {
  it('skips existing files until overwrite is ticked', () => {
    const onConfirm = vi.fn()
    render(
      <ClipcodeRestorePreviewDialog
        pending={{
          rootPath: '/f',
          entries,
          suggestion: undefined,
          states: new Map([['old.ts', 'file']])
        }}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />
    )
    expect(screen.getByText('Create (1)')).toBeInTheDocument()
    expect(screen.getByText('Overwrite (1)')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Restore' }))
    expect(onConfirm).toHaveBeenLastCalledWith(expect.objectContaining({ overwrite: false }))

    fireEvent.click(screen.getByLabelText('Overwrite existing files'))
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }))
    expect(onConfirm).toHaveBeenLastCalledWith(expect.objectContaining({ overwrite: true }))
  })

  it('re-plans paths when the suggested adjustment is unticked', () => {
    render(
      <ClipcodeRestorePreviewDialog
        pending={{
          rootPath: '/f',
          entries: [entries[0]],
          suggestion: { base: { kind: 'add', prefix: 'repo' }, label: 'repo/' },
          states: new Map()
        }}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />
    )
    expect(screen.getByText('repo/new.ts')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Adjust paths (repo/)'))
    expect(screen.getByText('new.ts')).toBeInTheDocument()
  })

  it('disables Restore when there is nothing to do', () => {
    render(
      <ClipcodeRestorePreviewDialog
        pending={{
          rootPath: '/f',
          entries: [{ path: '../x', content: '', changeTypes: new Set() }],
          suggestion: undefined,
          states: new Map()
        }}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: 'Restore' })).toBeDisabled()
  })

  it('explains why each path is skipped', () => {
    render(
      <ClipcodeRestorePreviewDialog
        pending={{
          rootPath: '/f',
          entries: [
            { path: '../escape.txt', content: 'x', changeTypes: new Set(['NEW']) },
            { path: '/etc/abs.txt', content: 'x', changeTypes: new Set(['NEW']) }
          ],
          suggestion: undefined,
          states: new Map()
        }}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />
    )
    expect(screen.getByText('Skip (2)')).toBeInTheDocument()
    // The reason is its own element, so a long path can never cut it off.
    expect(screen.getByText('unsafe path')).toBeInTheDocument()
    expect(screen.getByText('outside the folder')).toBeInTheDocument()
    expect(screen.getByText('/etc/abs.txt')).toHaveClass('break-all')
  })
})
