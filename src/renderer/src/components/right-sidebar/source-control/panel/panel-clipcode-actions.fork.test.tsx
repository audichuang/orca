// @vitest-environment happy-dom
// Fork seam guard: the panel's row menu, section header and bulk bar must keep rendering ClipCode's Copy Full Source.
import '@testing-library/jest-dom/vitest'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ConfirmationDialogProvider } from '@/components/confirmation-dialog'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAppStore } from '@/store'
import { makeWorktree } from '../../../../store/slices/worktrees-slice-test-fixtures'

const mocks = vi.hoisted(() => ({
  readRuntimeFileContent: vi.fn(),
  writeClipboardText: vi.fn()
}))
vi.mock('@/runtime/runtime-file-read-client', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  readRuntimeFileContent: mocks.readRuntimeFileContent
}))

const { SourceControlPanel } = await import('./panel')

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState(), true)
  useAppStore.setState({
    repos: [{ id: 'repo-1', path: '/repo', displayName: 'repo', badgeColor: '#000', addedAt: 0 }],
    worktreesByRepo: {
      'repo-1': [makeWorktree({ id: 'wt-1', repoId: 'repo-1', path: '/repo', hostId: 'local' })]
    },
    activeWorktreeId: 'wt-1',
    gitStatusByWorktree: {
      'wt-1': [
        { path: 'a.ts', status: 'modified', area: 'unstaged' },
        { path: 'b.ts', status: 'modified', area: 'unstaged' }
      ]
    }
  })
  vi.stubGlobal('api', {
    ...window.api,
    ui: { ...window.api?.ui, writeClipboardText: mocks.writeClipboardText }
  })
  mocks.readRuntimeFileContent.mockImplementation(async (args: { relativePath: string }) => ({
    content: `content of ${args.relativePath}`,
    isBinary: false
  }))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

function renderPanel(): void {
  render(
    <ConfirmationDialogProvider>
      <TooltipProvider>
        <SourceControlPanel />
      </TooltipProvider>
    </ConfirmationDialogProvider>
  )
}

async function copiedPayload(): Promise<string> {
  await vi.waitFor(() => expect(mocks.writeClipboardText).toHaveBeenCalledTimes(1))
  return String(mocks.writeClipboardText.mock.calls[0]?.[0])
}

describe('ClipCode Copy Full Source in the source control panel', () => {
  it('sits after Copy Relative Path in a changed row menu and copies that row', async () => {
    renderPanel()
    fireEvent.contextMenu(screen.getByText('a.ts'))
    const menu = await screen.findByRole('menu')
    const layout = [...menu.querySelectorAll('[role="menuitem"], [role="separator"]')].map(
      (node) => (node.getAttribute('role') === 'separator' ? '---' : node.textContent)
    )
    expect(layout.slice(0, 7)).toEqual([
      'View',
      expect.stringMatching(/^Open to the Side/),
      '---',
      'Copy Path',
      'Copy Relative Path',
      'Copy Full Source',
      '---'
    ])

    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy Full Source' }))

    const payload = await copiedPayload()
    expect(payload).toContain('content of a.ts')
    expect(payload).not.toContain('content of b.ts')
  })

  it('copies a whole section from its header', async () => {
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Copy Full Source' }))

    const payload = await copiedPayload()
    expect(payload).toContain('content of a.ts')
    expect(payload).toContain('content of b.ts')
  })

  it('copies the multi-selection from the bulk bar', async () => {
    renderPanel()
    const headerCopies = screen.getAllByRole('button', { name: 'Copy Full Source' })
    fireEvent.click(screen.getByText('b.ts'), { metaKey: true, ctrlKey: true })
    await screen.findByRole('button', { name: 'Clear selection' })
    // Why: the bar has no role of its own; its button is the Copy Full Source the selection added.
    const barCopy = screen
      .getAllByRole('button', { name: 'Copy Full Source' })
      .filter((button) => !headerCopies.includes(button))
    expect(barCopy).toHaveLength(1)

    fireEvent.click(barCopy[0])

    const payload = await copiedPayload()
    expect(payload).toContain('content of b.ts')
    expect(payload).not.toContain('content of a.ts')
  })
})
