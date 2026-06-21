import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

// Minimal stubs so the builder module can be imported without a real Electron env.
vi.mock('@/store', () => ({
  useAppStore: { getState: vi.fn() }
}))
vi.mock('@/runtime/runtime-file-client', () => ({
  importExternalPathsToRuntime: vi.fn()
}))
vi.mock('sonner', () => ({
  toast: { loading: vi.fn(), dismiss: vi.fn(), error: vi.fn() }
}))
vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string) => fallback
}))

// isWebClientLocation is mocked per-test below.
vi.mock('@/lib/web-client-location', () => ({
  isWebClientLocation: vi.fn(() => false)
}))

import { isWebClientLocation } from '@/lib/web-client-location'
import { buildClipboardImageSaver } from './terminal-clipboard-image-saver-builder'
import { importExternalPathsToRuntime } from '@/runtime/runtime-file-client'

function setupWindowApi(overrides: Partial<typeof window.api.ui> = {}) {
  const saveClipboardImageAsTempFile = vi.fn().mockResolvedValue('/remote/paste.png')
  const deleteClipboardImageTempFile = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(globalThis, 'window', {
    value: {
      api: {
        ui: {
          saveClipboardImageAsTempFile,
          deleteClipboardImageTempFile,
          ...overrides
        }
      }
    },
    writable: true,
    configurable: true
  })
  return { saveClipboardImageAsTempFile, deleteClipboardImageTempFile }
}

describe('buildClipboardImageSaver — web client branch', () => {
  beforeEach(() => {
    vi.mocked(isWebClientLocation).mockReturnValue(true)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns the raw saveClipboardImageAsTempFile in the web client', async () => {
    const { saveClipboardImageAsTempFile } = setupWindowApi()
    const saver = buildClipboardImageSaver('wt-1', '/repo', null)
    // The saver IS the raw API function — calling it with args must delegate directly.
    const result = await saver({ connectionId: 'c-1' })
    expect(result).toBe('/remote/paste.png')
    expect(saveClipboardImageAsTempFile).toHaveBeenCalledWith({ connectionId: 'c-1' })
  })

  it('does NOT call importExternalPathsToRuntime in the web client', async () => {
    setupWindowApi()
    const saver = buildClipboardImageSaver('wt-1', '/repo', null)
    await saver()
    // Why: the web staging stub returns { sources: [] }; the factory must be bypassed.
    expect(importExternalPathsToRuntime).not.toHaveBeenCalled()
  })
})
