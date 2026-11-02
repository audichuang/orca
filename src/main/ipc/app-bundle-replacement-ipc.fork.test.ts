import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, ...args: unknown[]) => unknown>(),
  captureLaunchedAppBundle: vi.fn(),
  isAppBundleReplaced: vi.fn(() => true)
}))

vi.mock('electron', () => ({
  app: { getAppPath: vi.fn(() => '/test/app'), isPackaged: false },
  BrowserWindow: { fromWebContents: vi.fn(() => null) },
  dialog: { showOpenDialog: vi.fn() },
  ipcMain: {
    handle: vi.fn((channel: string, handler: (event: unknown, ...args: unknown[]) => unknown) => {
      mocks.handlers.set(channel, handler)
    })
  }
}))
vi.mock('../app-bundle-replacement', () => ({
  captureLaunchedAppBundle: mocks.captureLaunchedAppBundle,
  isAppBundleReplaced: mocks.isAppBundleReplaced
}))
vi.mock('./renderer-shutdown-checkpoint', () => ({
  registerRendererShutdownCheckpointHandler: vi.fn()
}))
vi.mock('./macos-keyboard-layout-change-notifications', () => ({
  registerMacKeyboardLayoutChangeNotifications: vi.fn()
}))

import { registerAppHandlers } from './app'

beforeEach(() => {
  mocks.handlers.clear()
  mocks.captureLaunchedAppBundle.mockClear()
})

it('records the launched bundle and answers app:isBundleReplaced from it', async () => {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the bundle handlers never touch the store.
  registerAppHandlers({} as never)

  expect(mocks.captureLaunchedAppBundle).toHaveBeenCalledTimes(1)
  const handler = mocks.handlers.get('app:isBundleReplaced')
  expect(handler).toBeDefined()
  expect(await handler?.({})).toBe(true)
})
