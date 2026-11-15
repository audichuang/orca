// Fork-only: settle the mechanical conflicts of a rebase stop, or check a finished rebase against git's answer.
// Self-contained: the auto-rebase copies it to .rebase-review/ because fork files leave the tree mid-rebase.
//
//   node fork-rebase-stop-resolve.mjs <vOLD> <vNEW> <OLD_DEVELOP> [--drop-file <path>]...
// At a stop, per conflicted file:
//   - upstream deleted it and OLD_DEVELOP's net change to it is empty, or it is a --drop-file: git rm;
//   - OLD_DEVELOP's net change to it (at its pre-move path) is empty: take vNEW's file;
//   - every conflict hunk is single-line imports: keep upstream's lines, apply this commit's own adds and removes;
//   - anything else is left untouched for a hand resolution.
// Prints `HANDLED <path>` (pass these to fork-rebase-continue.sh) and `LEFT <path>`. Exit 0: all handled, 1: some left.
//
//   node fork-rebase-stop-resolve.mjs --verify <vOLD> <vNEW> <OLD_DEVELOP> [--dropped <sha>]...
// After the rebase, before fix commits: HEAD's tree may differ from `git merge-tree` of vNEW and OLD_DEVELOP only in
// the files that merge conflicts on and those the dropped commits touch. Exit 0: matches, 1: lists the other files.
import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { posix } from 'node:path'
import { pathToFileURL } from 'node:url'

const IMPORT_LINE =
  /^\s*(?:(import|export)\b(.*?)\bfrom\s+(['"])([^'"]+)\3|import\s+(['"])([^'"]+)\5)\s*;?\s*$/

/** Identity of a single-line import: its bindings plus the module's file name, so a moved path keeps its key. */
export function importKey(line) {
  const match = IMPORT_LINE.exec(line)
  if (!match) {
    return null
  }
  if (match[6]) {
    return `side-effect|${posix.basename(match[6])}`
  }
  return `${match[1]} ${match[2].trim()}|${posix.basename(match[4])}`
}

const onlyImports = (lines) => lines.every((line) => line.trim() === '' || importKey(line))

/**
 * Resolves diff3 conflict hunks whose three sides are only single-line imports: upstream's (ours) lines stay,
 * minus the imports this commit removed (base -> theirs), plus the ones it added. Other hunks stay as they are.
 */
export function resolveImportHunks(text) {
  const lines = text.split('\n')
  const out = []
  let resolved = 0
  let left = 0
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith('<<<<<<< ')) {
      out.push(lines[i])
      continue
    }
    const sides = { ours: [], base: [], theirs: [] }
    let side = 'ours'
    let end = i + 1
    for (; end < lines.length && !lines[end].startsWith('>>>>>>> '); end++) {
      if (lines[end].startsWith('||||||| ')) {
        side = 'base'
      } else if (lines[end] === '=======') {
        side = 'theirs'
      } else {
        sides[side].push(lines[end])
      }
    }
    if (!onlyImports(sides.ours) || !onlyImports(sides.base) || !onlyImports(sides.theirs)) {
      out.push(...lines.slice(i, end + 1))
      left++
      i = end
      continue
    }
    const baseKeys = new Set(sides.base.map(importKey).filter(Boolean))
    const theirKeys = new Set(sides.theirs.map(importKey).filter(Boolean))
    const kept = sides.ours.filter((line) => {
      const key = importKey(line)
      return !(key && baseKeys.has(key) && !theirKeys.has(key))
    })
    const keptKeys = new Set(kept.map(importKey).filter(Boolean))
    const added = sides.theirs.filter((line) => {
      const key = importKey(line)
      return key && !baseKeys.has(key) && !keptKeys.has(key)
    })
    out.push(...kept, ...added)
    resolved++
    i = end
  }
  return { text: out.join('\n'), resolved, left }
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
}

const gitOk = (...args) => spawnSync('git', args, { stdio: 'ignore' }).status === 0

function netChangeIsEmpty(vOld, oldDevelop, path) {
  return git('diff', '--name-only', vOld, oldDevelop, '--', path).trim() === ''
}

function prePaths(vOld, vNew) {
  const map = new Map()
  for (const line of git('diff', '-M', '--name-status', vOld, vNew).split('\n')) {
    const [status, oldPath, newPath] = line.split('\t')
    if (status?.startsWith('R')) {
      map.set(newPath, oldPath)
    }
  }
  return map
}

function resolveStop(vOld, vNew, oldDevelop, dropFiles) {
  const prePath = prePaths(vOld, vNew)
  const conflicted = git('status', '--porcelain')
    .split('\n')
    .filter((line) => /^(DU|UD|UU|AA|DD|AU|UA) /.test(line))
    .map((line) => ({ status: line.slice(0, 2), path: line.slice(3) }))
  let left = 0
  for (const { status, path } of conflicted) {
    const oldPath = prePath.get(path) ?? path
    const unchangedByFork = netChangeIsEmpty(vOld, oldDevelop, oldPath)
    const inNew = gitOk('cat-file', '-e', `${vNew}:${path}`)
    if (
      dropFiles.includes(path) ||
      ((status === 'DU' || status === 'UD') && unchangedByFork && !inNew)
    ) {
      git('rm', '-q', '--', path)
      console.log(`HANDLED ${path}\t(git rm)`)
      continue
    }
    if ((status === 'UU' || status === 'AA') && unchangedByFork && inNew) {
      writeFileSync(path, git('show', `${vNew}:${path}`))
      git('add', '--', path)
      console.log(`HANDLED ${path}\t(fork's net change is empty: took ${vNew})`)
      continue
    }
    if (status === 'UU' || status === 'AA') {
      git('checkout', '--conflict=diff3', '--', path)
      const result = resolveImportHunks(readFileSync(path, 'utf8'))
      writeFileSync(path, result.text)
      if (result.left === 0) {
        git('add', '--', path)
        console.log(`HANDLED ${path}\t(${result.resolved} import hunk(s))`)
        continue
      }
      console.log(
        `LEFT ${path}\t(${result.left} non-import hunk(s); ${result.resolved} import hunk(s) resolved)`
      )
    } else {
      console.log(`LEFT ${path}\t(${status})`)
    }
    left++
  }
  return left ? 1 : 0
}

function verify(vOld, vNew, oldDevelop, dropped) {
  const merge = spawnSync(
    'git',
    ['merge-tree', '--write-tree', '--name-only', `--merge-base=${vOld}`, vNew, oldDevelop],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  )
  if (merge.status !== 0 && merge.status !== 1) {
    console.error(merge.stderr)
    return 2
  }
  const [tree, ...rest] = merge.stdout.split('\n')
  const blank = rest.indexOf('')
  const expected = new Set(blank === -1 ? rest : rest.slice(0, blank))
  for (const sha of dropped) {
    for (const path of git('diff-tree', '--no-commit-id', '--name-only', '-r', sha).split('\n')) {
      if (path) {
        expected.add(path)
      }
    }
  }
  const unexpected = git('diff', '--name-only', tree, 'HEAD')
    .split('\n')
    .filter((path) => path && !expected.has(path))
  for (const path of unexpected) {
    console.log(`UNEXPECTED ${path}`)
  }
  console.error(
    `fork-rebase-stop-resolve --verify: ${expected.size} expected conflict or dropped file(s), ${unexpected.length} other difference(s)`
  )
  return unexpected.length ? 1 : 0
}

function main(argv) {
  const verifying = argv[0] === '--verify'
  const args = verifying ? argv.slice(1) : argv
  const positional = []
  const multi = { '--drop-file': [], '--dropped': [] }
  for (let i = 0; i < args.length; i++) {
    if (args[i] in multi) {
      multi[args[i]].push(args[++i])
    } else {
      positional.push(args[i])
    }
  }
  if (
    positional.length !== 3 ||
    multi['--drop-file'].includes(undefined) ||
    multi['--dropped'].includes(undefined)
  ) {
    console.error(
      'usage: fork-rebase-stop-resolve.mjs [--verify] <vOLD> <vNEW> <OLD_DEVELOP> [--drop-file <path> | --dropped <sha>]...'
    )
    return 2
  }
  const [vOld, vNew, oldDevelop] = positional
  return verifying
    ? verify(vOld, vNew, oldDevelop, multi['--dropped'])
    : resolveStop(vOld, vNew, oldDevelop, multi['--drop-file'])
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = main(process.argv.slice(2))
}
