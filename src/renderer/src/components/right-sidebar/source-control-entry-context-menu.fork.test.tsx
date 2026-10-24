import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OpenInApplication } from '../../../../shared/ui-chrome-types'
import { SourceControlEntryContextMenu } from './source-control/listing/entry-context-menu'

type ItemProps = { onSelect?: () => void; disabled?: boolean; children?: React.ReactNode }

const items = vi.hoisted(() => ({ list: [] as ItemProps[] }))
const storeState = vi.hoisted(
  (): {
    settings: {
      openInApplications: OpenInApplication[]
      activeRuntimeEnvironmentId: string | null
    }
    worktreesByRepo: Record<string, { id: string; repoId: string; hostId: string }[]>
  } => ({
    settings: { openInApplications: [], activeRuntimeEnvironmentId: null },
    worktreesByRepo: { 'repo-1': [{ id: 'worktree-1', repoId: 'repo-1', hostId: 'local' }] }
  })
)
const ownerRuntime = vi.hoisted((): { environmentId: string | null } => ({ environmentId: null }))
const revealInFileManager = vi.hoisted(() => vi.fn())
const openWorktreePath = vi.hoisted(() => vi.fn())

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
  runtimeEnvironmentIdOrLocalUnlessTwin: () => ownerRuntime.environmentId
}))

vi.mock(import('@/lib/reveal-in-file-manager'), async (importOriginal) => ({
  ...(await importOriginal()),
  getRevealInFileManagerLabel: () => 'Reveal in Finder',
  revealInFileManager
}))

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string) => fallback
}))

vi.mock('@/lib/open-in-app-catalog', () => ({
  OpenInApplicationIcon: () => null
}))

vi.mock('@/components/sidebar/WorktreeOpenInMenu', async () => {
  const { getExternalEditorOpenCapability } = await import('@/lib/external-editor-open-capability')
  return {
    getOpenInEntryAvailability: (
      entry: { command?: string },
      connectionId?: string | null,
      runtimeEnvironmentId?: string | null
    ) => ({
      disabled: !getExternalEditorOpenCapability({
        command: entry.command,
        connectionId,
        runtimeEnvironmentId
      }).allowed
    }),
    openOpenInAppsSettings: vi.fn(),
    openWorktreePath
  }
})

function childrenText(children: React.ReactNode): string {
  return React.Children.toArray(children)
    .map((child) => {
      if (typeof child === 'string') {
        return child
      }
      return React.isValidElement<{ children?: React.ReactNode }>(child)
        ? childrenText(child.props.children)
        : ''
    })
    .join('')
}

function renderMenu(onOpenToSide?: () => void): void {
  renderToStaticMarkup(
    <SourceControlEntryContextMenu
      currentWorktreeId="worktree-1"
      absolutePath="/repo/src/example.ts"
      relativePath="src/example.ts"
      hasWorkingTreeFile
      onOpenToSide={onOpenToSide}
      onRevealInExplorer={vi.fn()}
    >
      <div />
    </SourceControlEntryContextMenu>
  )
}

describe('SourceControlEntryContextMenu Open to the Side', () => {
  beforeEach(() => {
    items.list = []
  })

  it('offers Open to the Side only when the row can open', () => {
    const onOpenToSide = vi.fn()
    renderMenu(onOpenToSide)
    const item = items.list.find((entry) =>
      childrenText(entry.children).startsWith('Open to the Side')
    )
    expect(item?.disabled).toBe(false)
    item?.onSelect?.()
    expect(onOpenToSide).toHaveBeenCalledOnce()

    items.list = []
    renderMenu()
    const disabled = items.list.find((entry) =>
      childrenText(entry.children).startsWith('Open to the Side')
    )
    expect(disabled?.disabled).toBe(true)
  })
})
