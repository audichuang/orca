// @vitest-environment happy-dom

import path from 'node:path'
import React, { type ReactNode, act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../../shared/constants'
import type { TuiAgent } from '../../../../shared/tui-agent'
import { folderWorkspaceKey } from '../../../../shared/workspace-scope'

const mocks = vi.hoisted(() => ({
  ensureDetectedAgents: vi.fn(),
  onStart: vi.fn()
}))
// As the route decides: codex is chat-by-default and opens as a chat without its CLI, except
// below the folder root (/work), where the launch is a terminal.
const belowRoot = (cwd?: string | null): boolean => !!cwd && cwd !== '/work'
vi.mock('./source-control-launch-agent-args-applicability', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  sourceControlLaunchAppliesAgentArgs: (input: { initialCwd?: string | null }) =>
    belowRoot(input.initialCwd)
}))
vi.mock('@/lib/host-chat-program', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  agentsOfferedForLaunch: (
    _state: unknown,
    _workspace: unknown,
    detected: readonly TuiAgent[] | null,
    cwd?: string | null
  ): TuiAgent[] => (belowRoot(cwd) ? [...(detected ?? [])] : [...(detected ?? []), 'codex'])
}))
vi.mock('@/runtime/runtime-git-status-client', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getRuntimeGitMutationInFlight: async () => ({ inFlight: false })
}))
vi.mock('@/components/agent/AgentCombobox', () => ({
  default: ({ value }: { value: string | null }) =>
    React.createElement('div', { 'data-agent-value': value ?? '' })
}))
vi.mock('@/components/ui/dialog', () => {
  const box = ({ children }: { children?: ReactNode }) => React.createElement('div', null, children)
  return {
    Dialog: ({ open, children }: { open: boolean; children?: ReactNode }) =>
      open ? React.createElement('div', null, children) : null,
    DialogContent: box,
    DialogDescription: box,
    DialogFooter: box,
    DialogHeader: box,
    DialogTitle: box
  }
})
vi.mock('@/components/ui/select', () => {
  const box = ({ children }: { children?: ReactNode }) => React.createElement('div', null, children)
  return {
    Select: box,
    SelectContent: box,
    SelectItem: box,
    SelectTrigger: box,
    SelectValue: () => null
  }
})
vi.mock('../source-control/SourceControlActionVariableChips', () => ({
  SourceControlActionVariableChips: () => null
}))
vi.mock('@/lib/source-control-agent-action-launch-check', () => ({
  checkSourceControlAgentActionLaunch: () => ({ ok: true })
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
import { useAppStore, type AppState } from '@/store'
import { makeFolderWorkspace } from '@/store/slices/worktrees-slice-test-fixtures'
import { SourceControlAgentActionDialog } from './SourceControlAgentActionDialog'

function settingsWithSavedRecipe(): AppState['settings'] {
  const base = getDefaultSettings(path.resolve('tmp'))
  return {
    ...base,
    defaultTuiAgent: 'codex',
    sourceControlAi: {
      ...base.sourceControlAi!,
      enabled: true,
      agentId: 'codex',
      actions: {
        resolveConflicts: { agentId: 'codex', commandInputTemplate: '{basePrompt}', agentArgs: '' }
      }
    }
  }
}

let container: HTMLDivElement
let root: Root
let initialState: AppState

function render(overrides: Partial<React.ComponentProps<typeof SourceControlAgentActionDialog>>) {
  act(() => {
    root.render(
      <SourceControlAgentActionDialog
        open
        onOpenChange={() => {}}
        actionId="resolveConflicts"
        title="Launch agent"
        description="Review the launch recipe before starting."
        baseCommandInput="Resolve conflicts."
        savedCommandInputTemplate="{basePrompt}"
        savedAgentArgs=""
        launchSource="source_control_recovery"
        savedAgentId="codex"
        worktreeId={folderWorkspaceKey('folder-1')}
        connectionId={null}
        onStart={mocks.onStart}
        {...overrides}
      />
    )
  })
}

describe('SourceControlAgentActionDialog in a folder workspace', () => {
  beforeEach(() => {
    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)
    initialState = useAppStore.getState()
    vi.clearAllMocks()
    mocks.ensureDetectedAgents.mockResolvedValue([])
    mocks.onStart.mockResolvedValue(true)
    useAppStore.setState({
      settings: settingsWithSavedRecipe(),
      folderWorkspaces: [makeFolderWorkspace({ id: 'folder-1', folderPath: '/work' })],
      ensureDetectedAgents: mocks.ensureDetectedAgents
    })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })
  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    useAppStore.setState(initialState, true)
  })

  it('auto-starts a saved chat-only agent at the folder root', async () => {
    render({})
    await vi.waitFor(() => expect(mocks.onStart).toHaveBeenCalledTimes(1))
    expect(mocks.onStart).toHaveBeenCalledWith(expect.objectContaining({ agent: 'codex' }))
  })

  it('refuses a saved chat-only agent for a repo below the folder root', async () => {
    render({ initialCwd: '/work/repo-1' })
    await vi.waitFor(() =>
      expect(container.textContent?.toLowerCase()).toContain('not enabled or was not detected')
    )
    // The launch is a terminal there, so the saved CLI arguments apply.
    expect(container.textContent).toContain('CLI arguments')
    expect(mocks.onStart).not.toHaveBeenCalled()
  })

  it('never auto-picks a chat-only default agent for a repo below the folder root', async () => {
    render({ savedAgentId: null, initialCwd: '/work/repo-1' })
    await vi.waitFor(() => expect(container.textContent).toContain('Launch agent'))
    await act(async () => {
      await Promise.resolve()
    })
    expect(container.querySelector('[data-agent-value="codex"]')).toBeNull()
    expect(mocks.onStart).not.toHaveBeenCalled()
  })
})
