// Fork-only: covers the Show File History item the Git Graph's changed-files menu adds.
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SourceControlEntryContextMenu } from './entry-context-menu'

type ItemProps = { onSelect?: () => void; disabled?: boolean; children?: React.ReactNode }

const items = vi.hoisted(() => {
  const list: ItemProps[] = []
  return { list }
})
const storeState = vi.hoisted(() => ({
  settings: { openInApplications: [], activeRuntimeEnvironmentId: null },
  worktreesByRepo: { 'repo-1': [{ id: 'worktree-1', repoId: 'repo-1', hostId: 'local' }] }
}))

vi.mock('@/components/ui/context-menu', async () => {
  const React_ = await import('react')
  const passthrough = ({ children }: { children?: React.ReactNode }) =>
    React_.createElement(React_.Fragment, null, children)
  return {
    ContextMenu: passthrough,
    ContextMenuContent: passthrough,
    ContextMenuItem: (props: ItemProps) => {
      items.list.push(props)
      return React_.createElement(React_.Fragment, null, props.children)
    },
    ContextMenuSeparator: () => null,
    ContextMenuShortcut: passthrough,
    ContextMenuSub: passthrough,
    ContextMenuSubContent: passthrough,
    ContextMenuSubTrigger: passthrough,
    ContextMenuTrigger: passthrough
  }
})
vi.mock('@/store', () => ({
  useAppStore: (selector: (state: typeof storeState) => unknown) => selector(storeState)
}))
vi.mock('@/lib/worktree-runtime-owner', () => ({
  runtimeEnvironmentIdOrLocalUnlessTwin: () => null
}))
vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string) => fallback
}))
vi.mock('@/lib/open-in-app-catalog', () => ({ OpenInApplicationIcon: () => null }))
vi.mock('@/components/sidebar/WorktreeOpenInMenu', () => ({
  getOpenInEntryAvailability: () => ({ disabled: false }),
  openOpenInAppsSettings: vi.fn(),
  openWorktreePath: vi.fn()
}))

function findItem(label: string): ItemProps | undefined {
  return items.list.find((item) => renderToStaticMarkup(<>{item.children}</>).includes(label))
}

function renderMenu(onShowFileHistory?: () => void): void {
  renderToStaticMarkup(
    <SourceControlEntryContextMenu
      currentWorktreeId="worktree-1"
      absolutePath="/repo/src/example.ts"
      relativePath="src/example.ts"
      hasWorkingTreeFile
      onShowFileHistory={onShowFileHistory}
      onRevealInExplorer={vi.fn()}
    >
      <div />
    </SourceControlEntryContextMenu>
  )
}

beforeEach(() => {
  items.list = []
})

describe('SourceControlEntryContextMenu Show File History', () => {
  it('is absent when the caller has no history to show', () => {
    renderMenu()
    expect(findItem('Show File History')).toBeUndefined()
  })

  it('appears and runs the handler on select', () => {
    const onShowFileHistory = vi.fn()
    renderMenu(onShowFileHistory)
    const item = findItem('Show File History')
    expect(item?.disabled).toBeFalsy()
    item?.onSelect?.()
    expect(onShowFileHistory).toHaveBeenCalledTimes(1)
  })
})
