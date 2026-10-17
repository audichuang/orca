import { writeFile } from 'node:fs/promises'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runProcess } from '../../../shared/child-process/run-process'
import { gitCommit, gitInit, type MockDispatcher } from '../../../relay/git-handler-test-setup'
import {
  createGitHandlerRelay,
  createGitTempDir,
  removeGitTempDir
} from '../../../relay/git-handler-test-harness'
import type { GitHandler } from '../../../relay/git-handler'
import type { GitDiffResult, GitDiffTextResult } from '../../../shared/git-diff-compare-types'
import { getDiff } from './file-diff'
import { invalidateGitReadCaches } from './git-read-cache-invalidation'

const BIG_INDEX_TEXT = 'i\n'.repeat(130_000)

describe('staged diff with skipRenderLimit', () => {
  let repo: string
  let dispatcher: MockDispatcher
  let handler: GitHandler

  beforeEach(async () => {
    repo = createGitTempDir()
    ;({ dispatcher, handler } = createGitHandlerRelay())
    gitInit(repo)
    invalidateGitReadCaches()
    await writeFile(path.join(repo, 'big.txt'), 'base\n')
    gitCommit(repo, 'initial')
    await writeFile(path.join(repo, 'big.txt'), BIG_INDEX_TEXT)
    const add = await runProcess({ program: 'git', args: ['add', 'big.txt'], cwd: repo })
    expect(add.code, add.stderr).toBe(0)
    await writeFile(path.join(repo, 'big.txt'), `${BIG_INDEX_TEXT}worktree-tail\n`)
  })

  afterEach(async () => {
    handler.dispose()
    invalidateGitReadCaches()
    await removeGitTempDir(repo)
  })

  async function diff(
    host: 'native' | 'relay',
    skipRenderLimit: boolean
  ): Promise<GitDiffTextResult> {
    const result = await rawDiff(host, skipRenderLimit)
    if (result.kind !== 'text') {
      throw new Error('expected a text diff')
    }
    return result
  }

  async function rawDiff(
    host: 'native' | 'relay',
    skipRenderLimit: boolean
  ): Promise<GitDiffResult> {
    if (host === 'native') {
      return getDiff(repo, 'big.txt', true, false, {}, skipRenderLimit)
    }
    const params = { worktreePath: repo, filePath: 'big.txt', staged: true }
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the relay git.diff handler returns a GitDiffResult.
    return (await dispatcher.callRequest(
      'git.diff',
      skipRenderLimit ? { ...params, skipRenderLimit: true } : params
    )) as GitDiffResult
  }

  it.each(['native', 'relay'] as const)(
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
