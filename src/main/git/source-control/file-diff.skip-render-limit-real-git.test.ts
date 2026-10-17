import { execFileSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { GitDiffResult, GitDiffTextResult } from '../../../shared/git-diff-compare-types'
import { createLocalGitProvider } from '../../providers/local-git-provider'
import { getDiff } from './file-diff'
import { invalidateGitReadCaches } from './git-read-cache-invalidation'

function git(dir: string, args: string[]): void {
  execFileSync('git', args, { cwd: dir, stdio: 'pipe' })
}

const BIG_INDEX_TEXT = 'i\n'.repeat(130_000)

describe('staged diff with skipRenderLimit', () => {
  let repo: string

  beforeEach(async () => {
    repo = mkdtempSync(path.join(tmpdir(), 'orca-skip-render-limit-'))
    git(repo, ['init'])
    git(repo, ['config', 'user.email', 'test@example.com'])
    git(repo, ['config', 'user.name', 'Test User'])
    invalidateGitReadCaches()
    await writeFile(path.join(repo, 'big.txt'), 'base\n')
    git(repo, ['add', '.'])
    git(repo, ['commit', '-m', 'initial'])
    await writeFile(path.join(repo, 'big.txt'), BIG_INDEX_TEXT)
    git(repo, ['add', 'big.txt'])
    await writeFile(path.join(repo, 'big.txt'), `${BIG_INDEX_TEXT}worktree-tail\n`)
  })

  afterEach(async () => {
    invalidateGitReadCaches()
    await rm(repo, { recursive: true, force: true })
  })

  async function diff(
    host: 'native' | 'provider',
    skipRenderLimit: boolean
  ): Promise<GitDiffTextResult> {
    const result = await rawDiff(host, skipRenderLimit)
    if (result.kind !== 'text') {
      throw new Error('expected a text diff')
    }
    return result
  }

  async function rawDiff(
    host: 'native' | 'provider',
    skipRenderLimit: boolean
  ): Promise<GitDiffResult> {
    if (host === 'native') {
      return getDiff(repo, 'big.txt', true, false, {}, skipRenderLimit)
    }
    // Why: runtime RPC and IPC diffs reach git through the provider, so it must forward the flag.
    return createLocalGitProvider().getDiff(repo, 'big.txt', true, false, skipRenderLimit)
  }

  it.each(['native', 'provider'] as const)(
    'returns the full index text on %s without leaking it into limited reads',
    async (host) => {
      const limitedFirst = await diff(host, false)
      expect(limitedFirst.largeDiffRenderLimit?.limited).toBe(true)
      expect(limitedFirst.modifiedContent).toBe('')

      const full = await diff(host, true)
      expect(full.largeDiffRenderLimit).toBeUndefined()
      expect(full.modifiedContent).toBe(BIG_INDEX_TEXT)

      const limitedAgain = await diff(host, false)
      expect(limitedAgain.largeDiffRenderLimit?.limited).toBe(true)
      expect(limitedAgain.modifiedContent).toBe('')
    }
  )
})
