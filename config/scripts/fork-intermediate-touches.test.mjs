import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

const SCRIPT = path.resolve('config/scripts/fork-intermediate-touches.mjs')
const dir = mkdtempSync(path.join(tmpdir(), 'fork-intermediate-touches-'))

afterAll(() => rmSync(dir, { recursive: true, force: true }))

function git(...args) {
  return execFileSync(
    'git',
    ['-c', 'user.name=t', '-c', 'user.email=t@invalid', '-c', 'commit.gpgsign=false', ...args],
    { cwd: dir, encoding: 'utf8' }
  ).trim()
}

function commit(message, files) {
  for (const [file, content] of Object.entries(files)) {
    if (content === null) {
      git('rm', '-q', file)
    } else {
      writeFileSync(path.join(dir, file), content)
    }
  }
  git('add', '-A')
  git('commit', '-q', '-m', message)
  return git('log', '-1', '--format=%h')
}

describe('fork-intermediate-touches', () => {
  it('lists only the upstream-changed files a fork commit touched and a later one restored', () => {
    git('init', '-q', '-b', 'main')
    const files = { 'a.test.ts': 'a0\n', 'b.ts': 'b0\n', 'c.ts': 'c0\n', 'd.ts': 'd0\n' }
    commit('base', files)
    git('tag', 'base')
    git('switch', '-q', '-c', 'upstream')
    commit('upstream deletes a, edits b', { 'a.test.ts': null, 'b.ts': 'b-up\n' })
    git('switch', '-q', 'main')
    const first = commit('fork edits a', { 'a.test.ts': 'a-fork\n' })
    const second = commit('fork restores a', { 'a.test.ts': 'a0\n' })
    commit('fork edits b for good', { 'b.ts': 'b-fork\n' })
    commit('fork edits d', { 'd.ts': 'd-fork\n' })
    commit('fork restores d', { 'd.ts': 'd0\n' })

    const output = execFileSync(
      'node',
      [SCRIPT, 'base', 'main', git('merge-base', 'base', 'upstream'), 'upstream'],
      { cwd: dir, encoding: 'utf8' }
    )
    expect(output).toBe(`D\ta.test.ts\t${first},${second}\n`)
  })

  function run(forkRef, upstream = 'upstream') {
    return execFileSync(
      'node',
      [SCRIPT, 'base2', forkRef, git('merge-base', 'base2', upstream), upstream],
      { cwd: dir, encoding: 'utf8' }
    )
  }

  it('does not report a delete-then-restore as a stop, and flags the revived file', () => {
    git('switch', '-q', 'main')
    commit('base2 files', { 'f.ts': 'f0\n', 'g.ts': 'g0\n', 'h.ts': 'h0\n' })
    git('tag', 'base2')
    git('switch', '-q', '-c', 'upstream2')
    commit('upstream deletes f, g and h', { 'f.ts': null, 'g.ts': null, 'h.ts': null })
    git('switch', '-q', 'main')
    commit('fork deletes f', { 'f.ts': null })
    const restored = commit('fork restores f', { 'f.ts': 'f0\n' })
    const edited = commit('fork edits g', { 'g.ts': 'g-fork\n' })
    const editedAgain = commit('fork restores g', { 'g.ts': 'g0\n' })
    const gone = commit('fork edits h', { 'h.ts': 'h-fork\n' })
    commit('fork deletes h for good', { 'h.ts': null })
    expect(run('main', 'upstream2')).toBe(
      `A\tf.ts\t${restored}\nD\tg.ts\t${edited},${editedAgain}\nD\th.ts\t${gone}\n`
    )
  })
})
