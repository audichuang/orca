import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { mergeLocaleJson } from './fork-locale-json-merge.mjs'

const scriptsDir = import.meta.dirname
const LOCALE = 'src/renderer/src/i18n/locales/en.json'

describe('mergeLocaleJson', () => {
  it('keeps keys both sides added to the same object, ours first', () => {
    const base = { a: { x: 'X' } }
    const ours = { a: { x: 'X', up: 'Up' } }
    const theirs = { a: { x: 'X', fork: 'Fork' } }
    expect(JSON.stringify(mergeLocaleJson(base, ours, theirs).merged)).toBe(
      JSON.stringify({ a: { x: 'X', up: 'Up', fork: 'Fork' } })
    )
  })

  it('takes the one side that changed or deleted a key', () => {
    const base = { kept: 'old', gone: 'G', moved: 'M' }
    const ours = { kept: 'new', gone: 'G', moved: 'M' }
    const theirs = { kept: 'old', moved: 'M' }
    expect(mergeLocaleJson(base, ours, theirs)).toEqual({
      merged: { kept: 'new', moved: 'M' },
      conflicts: []
    })
  })

  it('keeps keys named like Object.prototype members', () => {
    const base = JSON.parse('{"a":{}}')
    const theirs = JSON.parse('{"a":{"toString":"T","__proto__":"P","constructor":"C"}}')
    expect(JSON.stringify(mergeLocaleJson(base, base, theirs).merged)).toBe(
      '{"a":{"toString":"T","__proto__":"P","constructor":"C"}}'
    )
  })

  it('records a key both sides changed differently and takes the picked side', () => {
    const base = { k: 'base', gone: 'G' }
    const ours = { k: 'up', gone: 'G2' }
    const theirs = { k: 'fork' }
    expect(mergeLocaleJson(base, ours, theirs, { pick: 'theirs' })).toEqual({
      merged: { k: 'fork' },
      conflicts: ['k', 'gone']
    })
  })
})

describe('fork locale merge driver in a real rebase', () => {
  const roots = []
  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true })
    }
  })

  function setup() {
    const root = mkdtempSync(join(tmpdir(), "fork-locale-merge O'Reilly %A-"))
    roots.push(root)
    const repo = join(root, 'repo')
    // Why the quote, space and %A in the path: the driver command git stores must survive any checkout path.
    // Why the isolated env: a developer's global attributes or merge config must not decide the result.
    const env = {
      ...process.env,
      GIT_CONFIG_GLOBAL: join(root, 'gitconfig'),
      GIT_CONFIG_NOSYSTEM: '1',
      LC_ALL: 'C'
    }
    writeFileSync(env.GIT_CONFIG_GLOBAL, '[user]\n\tname = t\n\temail = t@invalid\n')
    const git = (cwd, ...args) =>
      execFileSync('git', args, { cwd, env, encoding: 'utf8', stdio: 'pipe' })
    const writeLocale = (cwd, catalog) => {
      mkdirSync(dirname(join(cwd, LOCALE)), { recursive: true })
      writeFileSync(join(cwd, LOCALE), `${JSON.stringify(catalog, null, 2)}\n`)
    }
    mkdirSync(repo)
    git(repo, 'init', '-q', '-b', 'up')
    writeLocale(repo, { auto: { a: 'A' } })
    git(repo, 'add', '.')
    git(repo, 'commit', '-qm', 'base')
    git(repo, 'branch', 'fork')
    writeLocale(repo, { auto: { a: 'A', ssh: { row: 'Row' } } })
    git(repo, 'commit', '-qam', 'upstream adds ssh')
    const wt = join(root, 'wt')
    git(repo, 'worktree', 'add', '-q', wt, 'fork')
    return { repo, wt, env, git, writeLocale }
  }

  // The driver lands after the fork's locale commits, so the rebase replays those before it exists in the tree.
  function rebaseOntoUp({ wt, env, git }, { breakDriver = false } = {}) {
    mkdirSync(join(wt, 'config/scripts'), { recursive: true })
    for (const name of ['fork-locale-json-merge.mjs', 'fork-merge-driver-install.mjs']) {
      copyFileSync(join(scriptsDir, name), join(wt, 'config/scripts', name))
    }
    git(wt, 'add', 'config')
    git(wt, 'commit', '-qm', 'fork scripts')
    execFileSync(process.execPath, ['config/scripts/fork-merge-driver-install.mjs'], {
      cwd: wt,
      env,
      stdio: 'pipe'
    })
    if (breakDriver) {
      const driver = git(wt, 'config', 'merge.fork-locale-json.driver').trim()
      git(
        wt,
        'config',
        'merge.fork-locale-json.driver',
        driver.replace("fork-locale-json-merge.mjs' %O", "missing.mjs' %O")
      )
    }
    return spawnSync('git', ['rebase', 'up'], { cwd: wt, env, encoding: 'utf8' })
  }

  it('replays a fork commit that added keys next to upstream ones without a conflict', () => {
    const ctx = setup()
    ctx.writeLocale(ctx.wt, { auto: { a: 'A', GitHistoryGraph: 'Git Graph' } })
    ctx.git(ctx.wt, 'commit', '-qam', 'fork adds graph')

    const result = rebaseOntoUp(ctx)

    expect(result.status, result.stderr).toBe(0)
    expect(readFileSync(join(ctx.wt, LOCALE), 'utf8')).toBe(
      `${JSON.stringify({ auto: { a: 'A', ssh: { row: 'Row' }, GitHistoryGraph: 'Git Graph' } }, null, 2)}\n`
    )
  })

  it('marks only the string both sides changed and keeps every clean addition', () => {
    const ctx = setup()
    ctx.writeLocale(ctx.wt, { auto: { a: 'Fork A', GitHistoryGraph: 'Git Graph' } })
    ctx.git(ctx.wt, 'commit', '-qam', 'fork rewords a and adds graph')
    ctx.writeLocale(ctx.repo, { auto: { a: 'Up A', ssh: { row: 'Row' } } })
    ctx.git(ctx.repo, 'commit', '-qam', 'upstream rewords a')

    const result = rebaseOntoUp(ctx)

    expect(result.status).not.toBe(0)
    const text = readFileSync(join(ctx.wt, LOCALE), 'utf8')
    const hunk = text.slice(text.indexOf('<<<<<<< ours'), text.indexOf('>>>>>>> theirs'))
    expect(hunk).toContain('"a": "Up A"')
    expect(hunk).toContain('"a": "Fork A"')
    expect(hunk).not.toMatch(/ssh|GitHistoryGraph/)
    expect(text).toContain('"GitHistoryGraph": "Git Graph"')
    expect(text).toContain('"row": "Row"')
  })

  it('leaves conflict markers when the driver cannot run', () => {
    const ctx = setup()
    ctx.writeLocale(ctx.wt, { auto: { a: 'A', GitHistoryGraph: 'Git Graph' } })
    ctx.git(ctx.wt, 'commit', '-qam', 'fork adds graph')

    const result = rebaseOntoUp(ctx, { breakDriver: true })

    expect(result.status).not.toBe(0)
    expect(readFileSync(join(ctx.wt, LOCALE), 'utf8')).toContain('<<<<<<< ours')
  })
})
