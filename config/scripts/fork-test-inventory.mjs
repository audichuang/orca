// Fork test inventory: the seam list, collection checks for fork-added tests, and the canary's test selection.
// config/fork-seam-tests.txt groups the seam contract tests by seam, for `make fork-check-seams` and the auto-rebase
// reviewer's mutation pass; a renamed entry would drop out silently, since vitest skips an unmatched filter.
// Usage: node config/scripts/fork-test-inventory.mjs <mode>
//   list                         print the listed paths; fail on a missing, duplicate or uncollected entry
//   check <fork-base>            validate the list, config/fork-upstream-e2e.txt and the flaky baseline, and that every
//                                test the fork added since <fork-base> has a runner
//   fork-changed <fork-base> <ref>  print the canary's tests: unit tests collected here that the fork added or changed
//                                up to <ref>, plus every collected seam-list entry
//   fork-dropped <fork-base> <ref>  print `<reason>\t<path>` for each of those tests missing here or not collected
//   wire                         print the cross-version wire tests fork-check-wire runs
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { discoverUnitFiles } from './ci/unit-selection/dependency-graph/ci-unit-files.mjs'
import { wireTests } from './fork-wire-tests.mjs'

const LIST = 'config/fork-seam-tests.txt'
const E2E_LIST = 'config/fork-upstream-e2e.txt'
const FLAKY_BASELINE = 'config/flaky-test-pattern-baseline.txt'
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/
// Why: fork-check-e2e selects e2e specs by its own diff (`tests/e2e/*.spec.ts` pathspec, which spans directories).
const E2E_SPEC = /^tests\/e2e\/.+\.spec\.ts$/

function usage() {
  console.error(
    'usage: fork-test-inventory.mjs list | check <fork-base> | fork-changed|fork-dropped <fork-base> <ref> | wire'
  )
  process.exit(2)
}

function changedSince(base, ref, filter) {
  return execFileSync(
    'git',
    ['diff', '--name-only', '--no-renames', `--diff-filter=${filter}`, base, ref],
    { encoding: 'utf8', maxBuffer: 1 << 28 }
  )
    .split('\n')
    .filter(Boolean)
}

function listProblems(paths, collected) {
  const problems = []
  const seen = new Set()
  for (const path of paths) {
    if (seen.has(path)) {
      problems.push(`${path}: listed twice in ${LIST}`)
    } else if (!existsSync(path)) {
      problems.push(`${path}: listed in ${LIST} but missing (renamed or deleted?)`)
    } else if (!collected.has(path)) {
      problems.push(
        `${path}: listed in ${LIST} but not collected by config/scripts/ci/unit-selection/dependency-graph/ci-unit-files.mjs`
      )
    }
    seen.add(path)
  }
  return problems
}

// Why the pattern: playwright reads spec arguments as regexes, so the list may only hold plain paths.
const UPSTREAM_E2E_PATH = /^tests\/e2e\/[^/]+\.spec\.ts$/
const PLAIN_PATH = /^[A-Za-z0-9._/-]+$/

function readEntries(file) {
  return readFileSync(file, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
}

// Why forkAdded: a spec the fork added is already selected by diff, and `sort -u` would hide a duplicate here.
export function upstreamE2eProblems(lines, { exists, forkAdded, read }) {
  const problems = []
  const seen = new Set()
  for (const path of lines) {
    const bad = (why) => problems.push(`${path}: ${why} (${E2E_LIST})`)
    if (seen.has(path)) {
      bad('listed twice')
    } else if (!UPSTREAM_E2E_PATH.test(path) || !PLAIN_PATH.test(path)) {
      bad('not a plain tests/e2e/<name>.spec.ts path')
    } else if (!exists(path)) {
      bad('missing; upstream deleted or renamed it, so delete the line')
    } else if (forkAdded.has(path)) {
      bad('added by the fork, which fork-check-e2e already selects by diff')
    } else if (read(path).includes('@headful')) {
      bad('tagged @headful, so the electron-headless project never runs it')
    }
    seen.add(path)
  }
  return problems
}

// Why: a fork line in the flaky baseline conflicts on rebase; fix the test or use an ast-grep-ignore with a reason.
export function forkBaselineAdditions(diff) {
  return diff
    .split('\n')
    .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
    .map(
      (line) =>
        `${FLAKY_BASELINE}: fork-added line "${line.slice(1)}"; fix the test or use ast-grep-ignore with a reason`
    )
}

function main() {
  const [mode, ...rest] = process.argv.slice(2)
  const valid =
    (mode === 'list' && rest.length === 0) ||
    (mode === 'check' && rest.length === 1) ||
    (mode === 'wire' && rest.length === 0) ||
    ((mode === 'fork-changed' || mode === 'fork-dropped') && rest.length === 2)
  if (!valid || rest.some((arg) => arg.startsWith('-'))) {
    usage()
  }

  if (mode === 'wire') {
    console.log(wireTests().join('\n'))
    process.exit(0)
  }

  const collected = new Set(discoverUnitFiles())
  const wire = new Set(wireTests())
  const hasRunner = (path) => collected.has(path) || wire.has(path) || E2E_SPEC.test(path)

  const paths = readEntries(LIST)

  if (mode === 'fork-changed' || mode === 'fork-dropped') {
    const [base, ref] = rest
    // Why the seam list too: a seam test the fork no longer edits (fork cases moved to a sibling) still guards a seam.
    const seams = new Set(paths)
    const tests = [
      ...new Set([
        ...changedSince(base, ref, 'AM').filter((path) => TEST_FILE.test(path)),
        ...seams
      ])
    ]
    // Why dropped is its own mode: a test the merged tree stops collecting would otherwise vanish from a green run.
    // Why no rename following: a missing path is a finding for a human to check.
    const runs = (path) => (seams.has(path) ? collected.has(path) : hasRunner(path))
    const selected =
      mode === 'fork-changed'
        ? tests.filter((path) => collected.has(path))
        : tests.flatMap((path) =>
            !existsSync(path)
              ? [`missing in the merged tree\t${path}`]
              : runs(path)
                ? []
                : [
                    `not collected by ${seams.has(path) ? 'the unit runner' : 'any runner'}\t${path}`
                  ]
          )
    console.log(selected.sort().join('\n'))
    process.exit(0)
  }
  const problems = listProblems(paths, collected)

  if (mode === 'check') {
    for (const path of changedSince(rest[0], 'HEAD', 'A')) {
      if (TEST_FILE.test(path) && !hasRunner(path)) {
        problems.push(`${path}: fork-added test that no runner collects (see ci-unit-files.mjs)`)
      }
    }
    problems.push(
      ...upstreamE2eProblems(readEntries(E2E_LIST), {
        exists: existsSync,
        forkAdded: new Set(changedSince(rest[0], 'HEAD', 'A')),
        read: (path) => readFileSync(path, 'utf8')
      })
    )
    const baselineDiff = execFileSync(
      'git',
      ['diff', '--no-renames', '-U0', rest[0], 'HEAD', '--', FLAKY_BASELINE],
      { encoding: 'utf8' }
    )
    problems.push(...forkBaselineAdditions(baselineDiff))
  }

  for (const problem of problems) {
    console.error(`fork-test-inventory: ${problem}`)
  }
  if (problems.length > 0) {
    process.exit(1)
  } else if (mode === 'list') {
    console.log(paths.join('\n'))
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
