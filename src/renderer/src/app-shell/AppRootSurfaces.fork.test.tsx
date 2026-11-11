// @vitest-environment happy-dom
// Fork: every ClipCode copy entry point asks its non-text question through the dialog host mounted here.

import '@testing-library/jest-dom/vitest'

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AppRootSurfaces } from './AppRootSurfaces'
import { askClipcodeNonTextChoice } from '@/components/right-sidebar/source-control/clipcode/clipcode-non-text-copy-dialog'
import type { FloatingWorkspacePanelState } from './use-floating-workspace-panel'
import type { OnboardingGate } from './use-onboarding-and-feature-tips'

const state = {
  activeView: 'terminal',
  activeModal: 'none',
  settings: {},
  statusBarVisible: false,
  persistedUIReady: false,
  petVisible: false,
  dictationState: 'idle',
  updateStatus: { state: 'idle' },
  activeContextualTourId: null,
  sshCredentialQueue: []
}
vi.mock('../store', () => ({
  useAppStore: (select: (s: typeof state) => unknown) => select(state)
}))
vi.mock('./use-lazy-modal-mounts', () => ({
  useLazyModalMounts: () => ({ mountedLazyModalIds: new Set(), shouldMountAddRepoDialog: false })
}))
vi.mock('./worktree-jump-palette-preload', () => ({
  usePreloadWorktreeJumpPalette: () => undefined,
  WorktreeJumpPalette: () => null
}))
vi.mock('../i18n/language-readiness', () => ({
  useLanguageReadiness: (select: (s: { ready: boolean }) => unknown) => select({ ready: true })
}))
vi.mock('./app-root-surface-boundaries', () => ({
  ModalBoundary: ({ children }: { children: React.ReactNode }) => children,
  OverlayBoundary: ({ children }: { children: React.ReactNode }) => children
}))
vi.mock('../components/error-boundaries/RecoverableRenderErrorBoundary', () => ({
  RecoverableRenderErrorBoundary: ({ children }: { children: React.ReactNode }) => children
}))
// The other root surfaces read app state this test does not build.
vi.mock('./AppNotificationCards', () => ({ AppNotificationCards: () => null }))
vi.mock('../components/onboarding/OnboardingLanguageLoading', () => ({
  OnboardingLanguageLoading: () => null
}))
vi.mock('../components/NewWorkspaceComposerModal', () => ({ default: () => null }))
vi.mock('../components/crash-report/CrashReportDialog', () => ({ CrashReportDialog: () => null }))
vi.mock('../components/editor/markdown/documents/MarkdownTemplatePicker', () => ({
  MarkdownTemplatePicker: () => null
}))
vi.mock('../components/tab-bar/RecentTabSwitcher', () => ({ default: () => null }))
vi.mock('../components/skills/SkillFreshnessUpdateDialog', () => ({
  SkillFreshnessUpdateDialog: () => null
}))
vi.mock('../components/star-nag/StarNagAgentValueMomentObserver', () => ({
  StarNagAgentValueMomentObserver: () => null
}))
vi.mock('../components/NativeChatResumeRuntimeModal', () => ({
  NativeChatResumeOnRestartModal: () => null
}))
vi.mock('../components/star-nag/StarNagToastHost', () => ({ StarNagToastHost: () => null }))
vi.mock('../components/TelemetryFirstLaunchSurface', () => ({
  TelemetryFirstLaunchSurface: () => null
}))
vi.mock('../components/ZoomOverlay', () => ({ ZoomOverlay: () => null }))
vi.mock('../components/wsl-move/WslMoveDialog', () => ({ WslMoveDialogHost: () => null }))
vi.mock('../components/macos-update-requirement/MacosUpdateRequirementHost', () => ({
  MacosUpdateRequirementHost: () => null
}))
vi.mock('../components/settings/runtime-environments/updates/RemoteServerUpdateDialog', () => ({
  default: () => null
}))

afterEach(cleanup)

it('mounts the ClipCode non-text copy dialog host', async () => {
  render(
    <AppRootSurfaces
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: a closed panel reads only these fields.
      floatingWorkspace={{ shouldMountPanel: false, open: false } as FloatingWorkspacePanelState}
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: onboarding stays unrendered without an onboarding value.
      onboardingGate={{ onboarding: null, shouldRender: false } as unknown as OnboardingGate}
    />
  )
  let choice: Promise<string> = Promise.resolve('')
  act(() => {
    choice = askClipcodeNonTextChoice({
      count: 1,
      totalBytes: 4096,
      files: [{ path: 'img/logo.png', size: 4096 }],
      includePayloadBytes: 6000,
      unreadOverLimitCount: 0
    })
  })

  expect(screen.getByRole('dialog', { name: 'Copy non-text files?' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Include' }))
  await expect(choice).resolves.toBe('include')
})
