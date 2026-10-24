import { describe, expect, it } from 'vitest'
import { classifyUpstreamFile } from './fork-footprint.mjs'

describe('classifyUpstreamFile', () => {
  it.each([
    ['src/renderer/src/components/editor/EditorPanel.tsx', 'production'],
    ['config/scripts/build-computer-macos.mjs', 'production'],
    ['src/main/git/history.test.ts', 'test'],
    ['config/scripts/ci-closed-pr-cancellation.test.mjs', 'test'],
    ['tests/e2e/folder.spec.ts', 'test'],
    ['src/renderer/src/components/terminal-pane/pty-connection-test-environment.ts', 'test'],
    ['src/main/updater/latest-version.ts', 'production'],
    ['src/renderer/src/i18n/locales/ja.json', 'locale'],
    ['src/renderer/src/i18n/en-runtime-required.json', 'locale'],
    ['config/renderer-layout-writer-baseline.txt', 'baseline'],
    ['src/shared/wsl-move/wsl-move-storage-dispositions.ts', 'baseline'],
    ['src/renderer/src/assets/main.css', 'other'],
    ['.github/workflows/ci-closed-pr-caches.yml', 'other'],
    ['AGENTS.md', 'other']
  ])('%s is %s', (path, category) => {
    expect(classifyUpstreamFile(path)).toBe(category)
  })
})
