import { rm, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runProcess } from '@orca/process-host'
import { getDiff } from './file-diff'
import { invalidateGitReadCaches } from './git-read-cache-invalidation'

function gitInit(dir: string): void {
  execFileSync('git', ['init'], { cwd: dir, stdio: 'pipe' })
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir, stdio: 'pipe' })
  execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: dir, stdio: 'pipe' })
}

function gitCommit(dir: string, message: string): void {
  execFileSync('git', ['add', '.'], { cwd: dir, stdio: 'pipe' })
  execFileSync('git', ['commit', '-m', message, '--allow-empty'], { cwd: dir, stdio: 'pipe' })
}

describe('real Git missing sides of a diff', () => {
  let repo: string

  beforeEach(() => {
    repo = mkdtempSync(path.join(tmpdir(), 'orca-real-git-'))
    gitInit(repo)
    invalidateGitReadCaches()
  })

  afterEach(async () => {
    invalidateGitReadCaches()
    await rm(repo, { recursive: true, force: true })
  })

  async function git(args: string[], input?: string): Promise<string> {
    const result = await runProcess({ program: 'git', args, cwd: repo, input })
    expect(result.code, result.stderr).toBe(0)
    return result.stdout
  }

  function diff(staged = false): Promise<unknown> {
    return getDiff(repo, 'file.txt', staged)
  }

  it('reports missing sides only for absent blobs, not for empty ones', async () => {
    await writeFile(path.join(repo, 'file.txt'), '')
    gitCommit(repo, 'initial')
    await writeFile(path.join(repo, 'file.txt'), 'dirty\n')
    expect(await diff()).toMatchObject({ originalContent: '', modifiedContent: 'dirty\n' })
    expect(await diff()).not.toHaveProperty('missingSides')
    await git(['rm', '-f', 'file.txt'])
    expect(await diff(true)).toMatchObject({ missingSides: ['modified'] })
    await writeFile(path.join(repo, 'new.txt'), '')
    await git(['add', 'new.txt'])
    expect(await getDiff(repo, 'new.txt', true)).toMatchObject({ missingSides: ['original'] })
  })
})
