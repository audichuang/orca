// Fork test inventory: the seam list, collection checks for fork-added tests, and the canary's test selection.
// config/fork-seam-tests.txt groups the seam contract tests by seam, for `make fork-check-seams` and the auto-rebase
// reviewer's mutation pass; a renamed entry would drop out silently, since vitest skips an unmatched filter.
// Usage: node config/scripts/fork-test-inventory.mjs <mode>
//   list                         print the listed paths; fail on a missing, duplicate or uncollected entry
//   list --existing              print the listed paths collected here; report problems on stderr, exit 0 (merged tree)
//   check <fork-base>            validate the list, and that every test the fork added since <fork-base> has a runner
//   fork-changed <fork-base> <ref>  print unit tests collected here that the fork added or changed up to <ref>
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { CROSS_VERSION_WIRE_DIR, discoverUnitFiles } from './ci-unit-files.mjs'

const LIST = 'config/fork-seam-tests.txt'
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/
// Why these count as run: fork-check-e2e selects e2e specs by its own diff, fork-check-wire runs the wire dir.
const E2E_SPEC = /^tests\/e2e\/.+\.spec\.ts$/

function usage() {
  console.error(
    'usage: fork-test-inventory.mjs list [--existing] | check <fork-base> | fork-changed <fork-base> <ref>'
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
        `${path}: listed in ${LIST} but not collected by config/scripts/ci-unit-files.mjs`
      )
    }
    seen.add(path)
  }
  return problems
}

const [mode, ...rest] = process.argv.slice(2)
const existing = mode === 'list' && rest.length === 1 && rest[0] === '--existing'
const valid =
  (mode === 'list' && (rest.length === 0 || existing)) ||
  (mode === 'check' && rest.length === 1) ||
  (mode === 'fork-changed' && rest.length === 2)
if (!valid || rest.some((arg, index) => arg.startsWith('-') && !(existing && index === 0))) {
  usage()
}

const collected = new Set(discoverUnitFiles())

if (mode === 'fork-changed') {
  const [base, ref] = rest
  console.log(
    changedSince(base, ref, 'AM')
      .filter((path) => collected.has(path))
      .join('\n')
  )
  process.exit(0)
}

const paths = readFileSync(LIST, 'utf8')
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line !== '' && !line.startsWith('#'))
const problems = listProblems(paths, collected)

if (mode === 'check') {
  for (const path of changedSince(rest[0], 'HEAD', 'A')) {
    const runs =
      collected.has(path) || E2E_SPEC.test(path) || path.startsWith(CROSS_VERSION_WIRE_DIR)
    if (TEST_FILE.test(path) && !runs) {
      problems.push(`${path}: fork-added test that no runner collects (see ci-unit-files.mjs)`)
    }
  }
}

for (const problem of problems) {
  console.error(`fork-test-inventory: ${problem}`)
}
if (existing) {
  console.log([...new Set(paths)].filter((path) => collected.has(path)).join('\n'))
} else if (problems.length > 0) {
  process.exit(1)
} else if (mode === 'list') {
  console.log(paths.join('\n'))
}
