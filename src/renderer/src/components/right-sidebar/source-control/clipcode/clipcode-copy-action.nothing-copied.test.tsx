// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { copyClipcodeCommitChanges } from './clipcode-copy-action'

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), dismiss: vi.fn() }
}))
vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string, values?: Record<string, string | number>) =>
    fallback.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => String(values?.[name] ?? ''))
}))

const writeClipboardText = vi.fn()
const commitDiff = vi.fn(async () => {
  throw new Error('fatal: bad object')
})

beforeEach(() => {
  Object.assign(window, { api: { ui: { writeClipboardText }, git: { commitDiff } } })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('Copy Full Source when everything selected is skipped', () => {
  it('leaves the clipboard alone and names the skipped files, one category per line', async () => {
    await copyClipcodeCommitChanges({
      rootPath: '/repo',
      context: { target: { kind: 'local' }, worktreeId: 'wt', worktreePath: '/repo' },
      loadCommits: async () => [
        {
          commitOid: 'a'.repeat(40),
          parentOids: ['1'.repeat(40)],
          entries: [
            { path: 'gone.ts', status: 'modified' },
            { path: 'a:b.png', status: 'added' }
          ]
        }
      ]
    })

    expect(writeClipboardText).not.toHaveBeenCalled()
    expect(toast.warning).toHaveBeenCalledTimes(1)
    const [title, options] = vi.mocked(toast.warning).mock.calls[0]
    expect(title).toBe('Nothing to copy')
    const description = options?.description
    const { container } = render(
      <>{typeof description === 'function' ? description() : description}</>
    )
    expect([...container.querySelectorAll('p')].map((line) => line.textContent)).toEqual([
      'Unreadable: 1 · gone.ts',
      'Name not portable: 1 · a:b.png'
    ])
  })
})
