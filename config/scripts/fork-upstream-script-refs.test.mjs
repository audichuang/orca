import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  collectScriptRefs,
  isForkOwnedPath,
  parseRenames,
  scriptRefProblems,
  suggestTargets
} from './fork-upstream-script-refs.mjs'

const SCRIPT = join(import.meta.dirname, 'fork-upstream-script-refs.mjs')
const root = mkdtempSync(join(tmpdir(), 'fork-upstream-script-refs-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

const run = (cwd, ...args) => spawnSync(args[0], args.slice(1), { cwd, encoding: 'utf8' })

function makeRepo(name, files) {
  const dir = join(root, name)
  mkdirSync(dir)
  run(dir, 'git', 'init', '-q')
  run(dir, 'git', 'config', 'user.email', 't@example.com')
  run(dir, 'git', 'config', 'user.name', 't')
  const write = (map) => {
    for (const [path, text] of Object.entries(map)) {
      mkdirSync(dirname(join(dir, path)), { recursive: true })
      writeFileSync(join(dir, path), text)
    }
  }
  write(files)
  run(dir, 'git', 'add', '-A')
  run(dir, 'git', 'commit', '-qm', 'init')
  return { dir, write }
}

const problems = (entries, existing, hints = () => []) =>
  scriptRefProblems(entries, { exists: (path) => existing.includes(path), hints })

describe('collectScriptRefs', () => {
  it('reports the line of a string path and a relative import', () => {
    const text = "import { a } from './run-lint.mjs'\n\nnode config/scripts/ci/x.mjs --flag\n"
    expect(collectScriptRefs('config/scripts/fork-a.mjs', text)).toEqual([
      { path: 'config/scripts/run-lint.mjs', line: 1 },
      { path: 'config/scripts/ci/x.mjs', line: 3 }
    ])
  })

  it('follows multi-line and dynamic imports and resolves ../ against the file', () => {
    const text = "import {\n  a\n} from '../scripts/run-lint.mjs'\nawait import('./later.mjs')\n"
    expect(collectScriptRefs('config/scripts/fork-a.mjs', text).map((ref) => ref.path)).toEqual([
      'config/scripts/run-lint.mjs',
      'config/scripts/later.mjs'
    ])
  })

  it.each([
    ['a fork script', 'node config/scripts/fork-lint-run.mjs'],
    ['a .fork. test', 'node config/scripts/ci-closed.fork.test.mjs'],
    ['a glob', 'config/scripts/*.test.mjs'],
    ['a make variable', 'node config/scripts/$(NAME).mjs'],
    ['a placeholder', 'config/scripts/<name>.mjs'],
    ['a directory', 'ls config/scripts/'],
    ['a trailing sentence dot', 'see config/scripts.'],
    ['an import of a fork script', "import { x } from './fork-pr-scope.mjs'"]
  ])('ignores %s', (_label, text) => {
    expect(collectScriptRefs('config/scripts/fork-a.mjs', text)).toEqual([])
  })

  it('treats fixture strings in a test as text, but not its real imports', () => {
    const text =
      "import { a } from './run-lint.mjs'\nconst s = \"export * from './b.js'\"\n'config/scripts/x.mjs'\n"
    expect(collectScriptRefs('config/scripts/fork-a.test.mjs', text)).toEqual([
      { path: 'config/scripts/run-lint.mjs', line: 1 }
    ])
  })

  it('does not read relative imports outside config/scripts', () => {
    const text =
      "import x from '../../src/main/a'\nimport y from '../electron-builder.config.cjs'\n"
    expect(collectScriptRefs('config/scripts/fork-a.test.mjs', text)).toEqual([])
  })
})

describe('scriptRefProblems', () => {
  const entries = [{ file: 'Makefile', text: 'a\nnode config/scripts/run-vitest.mjs run\n' }]

  it('names the missing script and the referencing file:line', () => {
    expect(problems(entries, [])).toEqual([
      'Makefile:2: config/scripts/run-vitest.mjs does not exist'
    ])
  })

  it('passes when the script exists', () => {
    expect(problems(entries, ['config/scripts/run-vitest.mjs'])).toEqual([])
  })

  it('appends the moved location', () => {
    const hints = () => ['config/scripts/test-runtime/run-vitest.mjs']
    expect(problems(entries, [], hints)).toEqual([
      'Makefile:2: config/scripts/run-vitest.mjs does not exist; now at config/scripts/test-runtime/run-vitest.mjs?'
    ])
  })
})

describe('suggestTargets', () => {
  it('prefers git renames, then same-named files, without duplicates', () => {
    const renames = parseRenames(
      [
        'R100\tconfig/scripts/a.mjs\tconfig/scripts/new/a.mjs',
        'R090\tconfig/scripts/b.mjs\tconfig/scripts/new/b.mjs',
        'M\tconfig/scripts/c.mjs',
        'R100\tsrc/a.ts\tsrc/b.ts'
      ].join('\n')
    )
    expect(
      suggestTargets('config/scripts/a.mjs', {
        renames,
        files: ['config/scripts/new/a.mjs', 'config/scripts/other/a.mjs']
      })
    ).toEqual(['config/scripts/new/a.mjs', 'config/scripts/other/a.mjs'])
  })
})

describe('isForkOwnedPath', () => {
  it.each([
    ['Makefile', true],
    ['.github/workflows/fork-pr.yml', true],
    ['.github/workflows/ci.yml', false],
    ['.claude/skills/orca-fork-canary/SKILL.md', true],
    ['config/fork-upstream-api.txt', true],
    ['config/scripts/fork-lint-run.mjs', true],
    ['config/scripts/run-lint.mjs', false]
  ])('%s', (path, owned) => {
    expect(isForkOwnedPath(path)).toBe(owned)
  })
})

describe('command', () => {
  // Why a throwaway repo: the script reads the repo that holds it, so copy it next to fake fork files.
  function repoWithScript(name, extra) {
    const files = {
      'config/scripts/run-vitest.mjs': '',
      'config/scripts/fork-upstream-script-refs.mjs': '',
      Makefile: 'test:\n\tnode config/scripts/run-vitest.mjs run\n',
      ...extra
    }
    const repo = makeRepo(name, files)
    run(repo.dir, 'cp', SCRIPT, join(repo.dir, 'config/scripts/fork-upstream-script-refs.mjs'))
    return repo
  }
  const lint = (dir) => run(dir, process.execPath, 'config/scripts/fork-upstream-script-refs.mjs')

  it('exits 0 when every referenced script exists', () => {
    expect(lint(repoWithScript('ok').dir).status).toBe(0)
  })

  it('exits 1 naming the file, line and the moved target git recorded', () => {
    const repo = repoWithScript('moved', {})
    mkdirSync(join(repo.dir, 'config/scripts/runtime'), { recursive: true })
    run(
      repo.dir,
      'git',
      'mv',
      'config/scripts/run-vitest.mjs',
      'config/scripts/runtime/run-vitest.mjs'
    )
    run(repo.dir, 'git', 'commit', '-qam', 'move')
    const result = lint(repo.dir)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain(
      'Makefile:2: config/scripts/run-vitest.mjs does not exist; now at config/scripts/runtime/run-vitest.mjs?'
    )
  })

  it('ignores a missing generated path and fork-owned script names', () => {
    const repo = repoWithScript('generated', {
      Makefile:
        'x:\n\tnode config/scripts/$(GEN).mjs\n\tnode config/scripts/fork-gone.mjs\n\tls config/scripts/*.mjs\n'
    })
    expect(lint(repo.dir).status).toBe(0)
  })
})
