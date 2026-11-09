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

  it('cancels the restore when the dialog is dismissed without the Cancel button', () => {
    const onCancel = vi.fn()
    render(
      <ClipcodeRestorePreviewDialog
        pending={{ rootPath: '/f', entries, suggestion: undefined, states: new Map() }}
        onCancel={onCancel}
        onConfirm={vi.fn()}
      />
    )
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
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

  it('shows non-text rows by size, identical targets as Unchanged and corrupt ones with a badge', () => {
    const sha = '039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81'
    const body = `// File skipped: non-text file, 3 bytes, sha256 ${sha}; base64 follows\nAQID`
    const onConfirm = vi.fn()
    render(
      <ClipcodeRestorePreviewDialog
        pending={{
          rootPath: '/f',
          entries: [
            { path: 'new.bin', content: body, changeTypes: new Set() },
            { path: 'same.bin', content: body, changeTypes: new Set() },
            { path: 'bad.bin', content: `${body.slice(0, -1)}`, changeTypes: new Set() }
          ],
          suggestion: undefined,
          states: new Map([['same.bin', 'nonUtf8File']]),
          existingSha256: new Map([['same.bin', sha]])
        }}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />
    )
    expect(screen.getByText('Unchanged (1)')).toBeInTheDocument()
    expect(screen.getAllByText('non-text file · 3 B')).toHaveLength(2)
    expect(screen.queryByLabelText('Overwrite existing files')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }))
    expect(
      onConfirm.mock.calls[0][0].preview.create.map((w: { relativePath: string }) => w.relativePath)
    ).toEqual(['new.bin'])
  })
})
