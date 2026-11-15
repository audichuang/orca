// Fork-only: settle a rebase stop's conflicts that need no judgement, or check a finished rebase against git merge-tree.
// Self-contained: the auto-rebase copies it into .rebase-review/ because fork files leave the tree mid-rebase.
// Usage: node fork-rebase-stop-resolve.mjs <vOLD> <vNEW> <OLD_DEVELOP> [--drop-file <path>]...
//        node fork-rebase-stop-resolve.mjs --verify <vOLD> <vNEW> <OLD_DEVELOP> [--dropped <sha>]...
// Stop mode prints HANDLED (staged), KEPT (already resolved, left for fork-rebase-continue.sh) and LEFT (resolve by
// hand); exit 0 none left, 1 some left. Verify mode prints UNEXPECTED paths; exit 0 none, 1 some. Exit 2: usage or git.
import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { posix } from 'node:path'
import { pathToFileURL } from 'node:url'

const IMPORT_LINE =
  /^\s*(?:(import|export)\b(.*?)\bfrom\s+(['"])([^'"]+)\3|import\s+(['"])([^'"]+)\5)\s*;?\s*$/
const CONFLICT_MARKER = /^<<<<<<< /m

// Why basename: upstream moves change a module's directory, not its file name, so a moved import keeps its key.
function importKey(line) {
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

function parseHunk(lines, start) {
  const sides = { ours: [], base: [], theirs: [] }
  let side = 'ours'
  let end = start + 1
  for (; end < lines.length && !lines[end].startsWith('>>>>>>> '); end++) {
    if (lines[end].startsWith('||||||| ')) {
      side = 'base'
    } else if (lines[end] === '=======') {
      side = 'theirs'
    } else {
      sides[side].push(lines[end])
    }
  }
  return { sides, end }
}

// Why: the fork commit pointing an import elsewhere under the same file name would read as "unchanged" by key.
function forkRepointedAnImport(base, theirs) {
  const baseByKey = new Map(base.filter(importKey).map((line) => [importKey(line), line.trim()]))
  return theirs.some((line) => {
    const before = baseByKey.get(importKey(line))
    return before !== undefined && before !== line.trim()
  })
}

/**
 * diff3 hunks made only of single-line imports keep upstream's (ours) lines and take this commit's own
 * adds and removes (base -> theirs); any other hunk stays as it is and counts as left.
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
    const { sides, end } = parseHunk(lines, i)
    const { ours, base, theirs } = sides
    if (
      !onlyImports(ours) ||
      !onlyImports(base) ||
      !onlyImports(theirs) ||
      forkRepointedAnImport(base, theirs)
    ) {
      out.push(...lines.slice(i, end + 1))
      left++
      i = end
      continue
    }
    const baseKeys = new Set(base.map(importKey).filter(Boolean))
    const theirKeys = new Set(theirs.map(importKey).filter(Boolean))
    const kept = ours.filter((line) => {
      const key = importKey(line)
      return !(key && baseKeys.has(key) && !theirKeys.has(key))
    })
    const keptKeys = new Set(kept.map(importKey).filter(Boolean))
    const added = theirs.filter((line) => {
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

const gitSucceeds = (...args) => spawnSync('git', args, { stdio: 'ignore' }).status === 0

// Why -l0: the default rename limit silently drops renames on a release that moves thousands of files.
function upstreamRenames({ vOld, vNew }) {
  const renames = []
  for (const line of git('diff', '-M', '-l0', '--name-status', vOld, vNew).split('\n')) {
    const [status, from, to] = line.split('\t')
    if (status?.startsWith('R')) {
      renames.push({ from, to })
    }
  }
  return renames
}

const forkLeavesUnchanged = ({ vOld, oldDevelop }, path) =>
  git('diff', '--name-only', vOld, oldDevelop, '--', path).trim() === ''

function resolveStop(refs, dropFiles) {
  const pathBefore = new Map(upstreamRenames(refs).map(({ from, to }) => [to, from]))
  const conflicted = git('status', '--porcelain')
    .split('\n')
    .filter((line) => /^(DU|UD|UU|AA|DD|AU|UA) /.test(line))
    .map((line) => ({ status: line.slice(0, 2), path: line.slice(3) }))
  let left = 0
  for (const { status, path } of conflicted) {
    const bothChanged = status === 'UU' || status === 'AA'
    if (bothChanged) {
      const content = readFileSync(path)
      if (content.includes(0)) {
        console.log(`LEFT ${path}\t(binary)`)
        left++
        continue
      }
      if (!CONFLICT_MARKER.test(content.toString('utf8'))) {
        console.log(
          `KEPT ${path}\t(no conflict markers: already resolved, e.g. by fork-canary-apply.sh)`
        )
        continue
      }
    }
    const unchangedByFork = forkLeavesUnchanged(refs, pathBefore.get(path) ?? path)
    const inNew = gitSucceeds('cat-file', '-e', `${refs.vNew}:${path}`)
    if (dropFiles.includes(path) || (unchangedByFork && !inNew)) {
      git('rm', '-q', '--', path)
      console.log(`HANDLED ${path}\t(git rm)`)
      continue
    }
    if (unchangedByFork) {
      git('checkout', refs.vNew, '--', path)
      console.log(`HANDLED ${path}\t(fork's net change is empty: took ${refs.vNew})`)
      continue
    }
    if (bothChanged) {
      git('checkout', '--conflict=diff3', '--', path)
      const result = resolveImportHunks(readFileSync(path, 'utf8'))
      writeFileSync(path, result.text)
      if (result.left === 0) {
        git('add', '--', path)
        console.log(`HANDLED ${path}\t(${result.resolved} import hunk(s))`)
        continue
      }
      console.log(
        `LEFT ${path}\t(${result.left} hunk(s) need a hand; ${result.resolved} import hunk(s) resolved)`
      )
    } else {
      console.log(`LEFT ${path}\t(${status})`)
    }
    left++
  }
  return left ? 1 : 0
}

function verify(refs, dropped) {
  const merge = spawnSync(
    'git',
    [
      'merge-tree',
      '--write-tree',
      '--name-only',
      `--merge-base=${refs.vOld}`,
      refs.vNew,
      refs.oldDevelop
    ],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  )
  if (merge.status !== 0 && merge.status !== 1) {
    console.error(merge.stderr)
    return 2
  }
  const [tree, ...rest] = merge.stdout.split('\n')
  const blank = rest.indexOf('')
  const expected = new Set(blank === -1 ? rest : rest.slice(0, blank))
  const pathAfter = new Map(upstreamRenames(refs).map(({ from, to }) => [from, to]))
  for (const sha of dropped) {
    for (const path of git('diff-tree', '--no-commit-id', '--name-only', '-r', sha).split('\n')) {
      if (path) {
        expected.add(pathAfter.get(path) ?? path)
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
    `--verify: ${expected.size} conflicted or dropped file(s) expected, ${unexpected.length} other difference(s)`
  )
  return unexpected.length ? 1 : 0
}

function main(argv) {
  const verifying = argv[0] === '--verify'
  const args = verifying ? argv.slice(1) : argv
  const positional = []
  const listOptions = { '--drop-file': [], '--dropped': [] }
  for (let i = 0; i < args.length; i++) {
    if (args[i] in listOptions) {
      listOptions[args[i]].push(args[++i])
    } else {
      positional.push(args[i])
    }
  }
  const missingValue = Object.values(listOptions).some((values) => values.includes(undefined))
  if (positional.length !== 3 || missingValue) {
    console.error(
      'usage: fork-rebase-stop-resolve.mjs [--verify] <vOLD> <vNEW> <OLD_DEVELOP> [--drop-file <path> | --dropped <sha>]...'
    )
    return 2
  }
  const [vOld, vNew, oldDevelop] = positional
  const refs = { vOld, vNew, oldDevelop }
  return verifying
    ? verify(refs, listOptions['--dropped'])
    : resolveStop(refs, listOptions['--drop-file'])
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = main(process.argv.slice(2))
}
