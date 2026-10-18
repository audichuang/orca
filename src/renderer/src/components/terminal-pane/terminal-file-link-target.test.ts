import { describe, expect, it, vi } from 'vitest'
import { extractTerminalFileLinks } from '@/lib/terminal-links'
import type * as FilePathMappingModule from './terminal-file-path-mapping'
import { TERMINAL_PATH_MISSING_CACHE_TTL_MS } from './terminal-path-exists-cache'
import {
  fileLinkTargetExists,
  mayCheckFileLinkTargetUnprompted,
  resolveFileLinkTarget,
  type FileLinkHost
} from './terminal-file-link-target'

const routing = vi.hoisted(() => {
  const state: { connectionId?: string } = {}
  return state
})

vi.mock('./terminal-file-path-mapping', async (importOriginal) => ({
  ...(await importOriginal<typeof FilePathMappingModule>()),
  getTerminalFileContext: (worktreeId: string, worktreePath: string) => ({
    target: { kind: 'local' },
    worktreeId,
    worktreePath,
    connectionId: routing.connectionId,
    sourceHostResolved: true
  })
}))
vi.mock('./terminal-worktree-path-link', () => ({
  resolveKnownWorktreeRootPathLink: () => null
}))

function mayCheck(pathText: string, workspace: string): boolean {
  const link = extractTerminalFileLinks(pathText).find(
    (candidate) => candidate.startIndex === 0 && candidate.endIndex === pathText.length
  )
  const host: FileLinkHost = { cwd: workspace, worktreeId: 'wt-1', worktreePath: workspace }
  const target = link ? resolveFileLinkTarget(link, host) : null
  if (!target) {
    throw new Error(`no target for ${pathText}`)
  }
  return mayCheckFileLinkTargetUnprompted(target, host)
}

describe('mayCheckFileLinkTargetUnprompted', () => {
  it('refuses a network share outside the workspace, on this machine or over SSH', () => {
    for (const connectionId of [undefined, 'ssh-1']) {
      routing.connectionId = connectionId
      try {
        for (const workspace of [String.raw`C:\Users\me\repo`, '/home/me/repo']) {
          expect(mayCheck(String.raw`\\evil.example\share\a.ts`, workspace)).toBe(false)
          expect(mayCheck('//evil.example/share/notes.md', workspace)).toBe(false)
        }
        expect(mayCheck('src/a.ts', '/home/me/repo')).toBe(true)
      } finally {
        routing.connectionId = undefined
      }
    }
  })

  it('allows paths inside a workspace on a network share', () => {
    expect(mayCheck('src/a.ts', String.raw`C:\Users\me\repo`)).toBe(true)
    expect(mayCheck('src/a.ts', String.raw`\\FileServer\share\repo`)).toBe(true)
    expect(
      mayCheck(String.raw`\\FILESERVER\Share\repo\src\a.ts`, String.raw`\\fileserver\share\repo`)
    ).toBe(true)
  })

  it("allows only the workspace's own WSL distro", () => {
    const wslWorkspace = String.raw`\\wsl.localhost\Ubuntu\home\me\repo`
    expect(mayCheck('/home/me/repo/a.ts', wslWorkspace)).toBe(true)
    expect(mayCheck(String.raw`\\wsl.localhost\ubuntu\etc\hosts.txt`, wslWorkspace)).toBe(true)
    expect(mayCheck(String.raw`\\wsl.localhost\Debian\etc\hosts.txt`, wslWorkspace)).toBe(false)
    expect(mayCheck('//wsl.localhost/../evil/share/a.ts', wslWorkspace)).toBe(false)
    expect(
      mayCheck(String.raw`\\wsl.localhost\Debian\etc\hosts.txt`, String.raw`C:\Users\me\repo`)
    ).toBe(false)
  })
})

describe('fileLinkTargetExists', () => {
  it('re-asks about a missing path once its miss expires, so a file written later still links', async () => {
    vi.useFakeTimers()
    try {
      const [link] = extractTerminalFileLinks('/tmp/report.html')
      const target = resolveFileLinkTarget(link!, {
        cwd: '/home/me/repo',
        worktreeId: 'wt-1',
        worktreePath: '/home/me/repo'
      })!
      const cache = new Map<string, boolean>()
      const pathExists = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true)

      expect(await fileLinkTargetExists(target, cache, pathExists)).toBe(false)
      expect(await fileLinkTargetExists(target, cache, pathExists)).toBe(false)
      expect(pathExists).toHaveBeenCalledTimes(1)

      vi.advanceTimersByTime(TERMINAL_PATH_MISSING_CACHE_TTL_MS)
      expect(await fileLinkTargetExists(target, cache, pathExists)).toBe(true)
      vi.advanceTimersByTime(TERMINAL_PATH_MISSING_CACHE_TTL_MS)
      expect(await fileLinkTargetExists(target, cache, pathExists)).toBe(true)
      expect(pathExists).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })
})
