// @vitest-environment happy-dom

import { expect, it, vi } from 'vitest'

const invoke = vi.hoisted(() => vi.fn(async () => true))

vi.mock('electron', () => ({ ipcRenderer: { invoke, on: vi.fn(), send: vi.fn() } }))

import { appApi } from './app-bridge'

it('asks main whether the installed bundle was replaced', async () => {
  await expect(appApi.isBundleReplaced()).resolves.toBe(true)
  expect(invoke).toHaveBeenCalledWith('app:isBundleReplaced')
})
