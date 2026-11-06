// Fork-only: lists upstream files a fork commit touched mid-history but left unchanged in the final tree. A merge
// shows no conflict for them, but a commit-by-commit rebase stops at each of those commits.
// Usage: node config/scripts/fork-intermediate-touches.mjs <fork-base> <fork-ref> <upstream-merge-base> <upstream-ref>
// Output: `D|M<TAB>path<TAB>fork commit short shas, oldest first`. D: upstream deleted the file, so the rebase stops
// to `git rm` it at each listed commit. M: upstream modified it, which stops the rebase only sometimes.
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const COMMIT_MARK = '\u0001'

// Only D and M: rename detection usually carries a fork edit across an upstream rename.
export function intermediateOnlyTouches({ upstreamChanges, forkTouched, finalUnchanged }) {
  return upstreamChanges
    .filter(({ path }) => forkTouched.has(path) && finalUnchanged.has(path))
    .map(({ status, path }) => ({ status, path, commits: forkTouched.get(path) }))
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
}

export function parseUpstreamChanges(nameStatus) {
  return nameStatus
    .split('\n')
    .map((line) => line.split('\t'))
    .filter(([status, , extra]) => (status === 'D' || status === 'M') && extra === undefined)
    .map(([status, path]) => ({ status, path }))
}

export function parseForkTouched(log) {
  const touched = new Map()
  let commit = ''
  for (const line of log.split('\n')) {
    if (line.startsWith(COMMIT_MARK)) {
      commit = line.slice(COMMIT_MARK.length)
    } else if (line) {
      touched.set(line, [...(touched.get(line) ?? []), commit])
    }
  }
  return touched
}

function unchangedInFinalTree(base, ref, path) {
  try {
    execFileSync('git', ['diff', '--quiet', base, ref, '--', path])
    return true
  } catch (error) {
    if (error.status === 1) {
      return false
    }
    throw error
  }
}

function main([forkBase, forkRef, mergeBase, upstreamRef]) {
  if (!upstreamRef) {
    console.error(
      'usage: fork-intermediate-touches.mjs <fork-base> <fork-ref> <upstream-merge-base> <upstream-ref>'
    )
    return 64
  }
  const upstreamChanges = parseUpstreamChanges(
    git(['diff', '--name-status', '-M', mergeBase, upstreamRef])
  )
  // Why --no-renames: a rename would hide the old path, which the rebase stops on.
  const forkTouched = parseForkTouched(
    git([
      'log',
      '--reverse',
      '--no-renames',
      '--name-only',
      `--format=${COMMIT_MARK}%h`,
      `${forkBase}..${forkRef}`
    ])
  )
  const candidates = upstreamChanges.filter(({ path }) => forkTouched.has(path))
  const finalUnchanged = new Set(
    candidates
      .map(({ path }) => path)
      .filter((path) => unchangedInFinalTree(forkBase, forkRef, path))
  )
  const rows = intermediateOnlyTouches({ upstreamChanges, forkTouched, finalUnchanged })
  for (const { status, path, commits } of rows.sort((a, b) => a.path.localeCompare(b.path))) {
    console.log(`${status}\t${path}\t${commits.join(',')}`)
  }
  return 0
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    process.exitCode = main(process.argv.slice(2))
  } catch (error) {
    console.error(
      `fork-intermediate-touches: ${error instanceof Error ? error.message : String(error)}`
    )
    process.exitCode = 1
  }
}
