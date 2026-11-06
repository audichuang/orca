// Fork-only: lists upstream files a fork commit touched mid-history but left as upstream-compatible in the final tree. A
// merge shows no conflict for them, but a commit-by-commit rebase can stop at each of those commits.
// Usage: node config/scripts/fork-intermediate-touches.mjs <fork-base> <fork-ref> <upstream-merge-base> <upstream-ref>
// Output: `D|M|A<TAB>path<TAB>fork commit short shas, oldest first`.
// D: upstream deleted the file and these fork commits modify it, so the rebase stops to `git rm` it at each.
// M: upstream modified it; the listed commits may stop the rebase (an edit often replays cleanly, a fork delete does not).
// A: upstream deleted the file and these fork commits re-add it, so the rebased tree revives it (no stop).
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const COMMIT_MARK = '\u0001'

// finalState: path -> 'unchanged' | 'absent' | 'changed' versus the fork base. Rename detection is off for the fork side.
export function intermediateOnlyTouches({ upstreamChanges, forkTouched, finalState }) {
  const rows = []
  for (const { status, path } of upstreamChanges) {
    const touches = forkTouched.get(path)
    const state = finalState.get(path)
    if (!touches || !state) {
      continue
    }
    if (status === 'M') {
      if (state === 'unchanged') {
        rows.push({ status: 'M', path, commits: touches.map((t) => t.commit) })
      }
      continue
    }
    const stops = touches.filter((t) => t.status === 'M').map((t) => t.commit)
    if (stops.length > 0) {
      rows.push({ status: 'D', path, commits: stops })
    }
    const revived = touches.filter((t) => t.status === 'A').map((t) => t.commit)
    if (state === 'unchanged' && revived.length > 0) {
      rows.push({ status: 'A', path, commits: revived })
    }
  }
  return rows
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
      const [status, path] = line.split('\t')
      touched.set(path, [...(touched.get(path) ?? []), { commit, status }])
    }
  }
  return touched
}

function finalTreeState(base, ref, path) {
  try {
    execFileSync('git', ['diff', '--quiet', base, ref, '--', path])
    return 'unchanged'
  } catch (error) {
    if (error.status !== 1) {
      throw error
    }
  }
  try {
    execFileSync('git', ['cat-file', '-e', `${ref}:${path}`], { stdio: 'ignore' })
    return 'changed'
  } catch {
    return 'absent'
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
      '--name-status',
      `--format=${COMMIT_MARK}%h`,
      `${forkBase}..${forkRef}`
    ])
  )
  const finalState = new Map(
    upstreamChanges
      .filter(({ path }) => forkTouched.has(path))
      .map(({ path }) => [path, finalTreeState(forkBase, forkRef, path)])
  )
  // A file both sides deleted still stops the rebase at the fork commit that modified it.
  for (const { status, path } of upstreamChanges) {
    if (status === 'M' && finalState.get(path) !== 'unchanged') {
      finalState.delete(path)
    }
  }
  const rows = intermediateOnlyTouches({ upstreamChanges, forkTouched, finalState })
  for (const { status, path, commits } of rows.sort(
    (a, b) => a.path.localeCompare(b.path) || a.status.localeCompare(b.status)
  )) {
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
