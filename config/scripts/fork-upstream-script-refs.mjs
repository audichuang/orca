// Fork check: every upstream script under config/scripts/ that a fork-owned file names or imports still exists.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, posix, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const SCRIPTS_DIR = 'config/scripts/'
const PATH_PATTERN = /config\/scripts\/([A-Za-z0-9_./-]+)/g
// Why anchored at line start: a test fixture's source text sits inside a string and is not an import of this file.
const IMPORT_PATTERN =
  /(?:^[ \t]*(?:import|export)\b[^'"]*?\bfrom\s*|^[ \t]*import\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)['"](\.\.?\/[^'"]+)['"]/gm
const FORK_OWNED = [
  /^Makefile$/,
  /^\.github\/workflows\/fork-[^/]+$/,
  /^\.claude\/skills\/orca-fork-[^/]+\//,
  /^config\/fork-[^/]+$/,
  /^config\/scripts\/fork-[^/]+$/
]

const isForkScript = (path) => /^fork-|\.fork\./.test(basename(path))
const isTestFile = (path) => /\.test\.[cm]?[jt]sx?$/.test(path) || path.endsWith('.test.sh')
// Why: `$(VAR)`, globs and placeholders name no single file.
const isConcretePath = (path) => /\.[A-Za-z0-9]+$/.test(path) && !/[*<>${}()]/.test(path)

export const isForkOwnedPath = (path) => FORK_OWNED.some((pattern) => pattern.test(path))

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length
}

/** `{ path, line }` for each upstream config/scripts file `file` names or imports; string paths in tests are fixtures, so tests only count imports. */
export function collectScriptRefs(file, text) {
  const refs = []
  if (!isTestFile(file)) {
    for (const match of text.matchAll(PATH_PATTERN)) {
      const path = SCRIPTS_DIR + match[1].replace(/\.+$/, '')
      if (isConcretePath(path) && !isForkScript(path)) {
        refs.push({ path, line: lineOf(text, match.index) })
      }
    }
  }
  if (file.startsWith(SCRIPTS_DIR) && /\.(?:[cm]?js|ts)$/.test(file)) {
    for (const match of text.matchAll(IMPORT_PATTERN)) {
      const path = posix.join(posix.dirname(file), match[1])
      if (path.startsWith(SCRIPTS_DIR) && isConcretePath(path) && !isForkScript(path)) {
        refs.push({ path, line: lineOf(text, match.index) })
      }
    }
  }
  return refs.sort((a, b) => a.line - b.line)
}

/** New locations for a vanished `path`: git rename records first, then same-named files now under config/scripts. */
export function suggestTargets(path, { renames = [], files = [] } = {}) {
  const fromGit = renames.filter((rename) => rename.from === path).map((rename) => rename.to)
  const sameName = files.filter(
    (candidate) => candidate !== path && basename(candidate) === basename(path)
  )
  return [...new Set([...fromGit, ...sameName])]
}

/** One message per reference whose target is gone; `exists` and `hints` are injected for tests. */
export function scriptRefProblems(entries, { exists, hints }) {
  const problems = []
  for (const { file, text } of entries) {
    for (const ref of collectScriptRefs(file, text)) {
      if (exists(ref.path)) {
        continue
      }
      const targets = hints(ref.path)
      const hint = targets.length > 0 ? `; now at ${targets.join(' or ')}?` : ''
      problems.push(`${file}:${ref.line}: ${ref.path} does not exist${hint}`)
    }
  }
  return problems
}

function git(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 })
  return result.status === 0 ? result.stdout : ''
}

/** Rename records for config/scripts across every ref this clone has, newest first. */
export function parseRenames(nameStatus) {
  const renames = []
  for (const line of nameStatus.split('\n')) {
    const [status, from, to] = line.split('\t')
    if (status?.startsWith('R') && from?.startsWith(SCRIPTS_DIR) && to) {
      renames.push({ from, to })
    }
  }
  return renames
}

function repoHints(root) {
  const files = git(root, ['ls-files', 'config/scripts']).split('\n').filter(Boolean)
  let renames
  return (path) => {
    renames ??= parseRenames(
      git(root, [
        'log',
        '--all',
        '-M',
        '--diff-filter=R',
        '--name-status',
        '--format=',
        '--',
        'config/scripts'
      ])
    )
    return suggestTargets(path, { renames, files })
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const root = resolve(dirname(process.argv[1]), '..', '..')
  const entries = git(root, ['ls-files'])
    .split('\n')
    .filter((path) => path && isForkOwnedPath(path) && existsSync(resolve(root, path)))
    .map((file) => ({ file, text: readFileSync(resolve(root, file), 'utf8') }))
  const problems = scriptRefProblems(entries, {
    exists: (path) => existsSync(resolve(root, path)),
    hints: repoHints(root)
  })
  if (problems.length > 0) {
    for (const problem of problems) {
      console.error(problem)
    }
    console.error(
      'A fork-owned file points at an upstream script that moved or was removed; rewrite each reference to the new path (git ls-tree -r --name-only <new-tag> config/scripts lists them).'
    )
    process.exit(1)
  }
  console.log(
    `fork upstream script refs: ${entries.length} fork-owned files, every upstream script they name exists`
  )
}
