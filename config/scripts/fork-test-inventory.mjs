// Fork test inventory: the seam list, collection checks for fork-added tests, and the canary's test selection.
// config/fork-seam-tests.txt groups the seam contract tests by seam, for `make fork-check-seams` and the auto-rebase
// reviewer's mutation pass; a renamed entry would drop out silently, since vitest skips an unmatched filter.
// Usage: node config/scripts/fork-test-inventory.mjs <mode>
//   list                         print the listed paths; fail on a missing, duplicate or uncollected entry
//   check <fork-base>            validate the list, and that every test the fork added since <fork-base> has a runner
//   fork-changed <fork-base> <ref>  print the canary's tests: unit tests collected here that the fork added or changed
//                                up to <ref>, plus every collected seam-list entry
//   fork-dropped <fork-base> <ref>  print `<reason>\t<path>` for each of those tests missing here or not collected
//   wire                         print the cross-version wire tests fork-check-wire runs
import { execFileSync } from 'node:child_process'
import { existsSync, globSync, readFileSync } from 'node:fs'
import { CROSS_VERSION_WIRE_DIR, discoverUnitFiles } from './ci-unit-files.mjs'

const LIST = 'config/fork-seam-tests.txt'
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/
// Why: fork-check-e2e selects e2e specs by its own diff (`tests/e2e/*.spec.ts` pathspec, which spans directories).
const E2E_SPEC = /^tests\/e2e\/.+\.spec\.ts$/
// Why skipped: at the fork base this upstream test reads isStructuredTab from a module that no longer exports it.
const WIRE_SKIPPED = 'cross-version-registered-agents.unit.test.ts'

function wireTests() {
  return globSync(`${CROSS_VERSION_WIRE_DIR}**/*.test.ts`)
    .map((file) => file.replaceAll('\\', '/'))
    .filter((file) => file.split('/').at(-1) !== WIRE_SKIPPED)
    .sort()
}

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
        `${path}: listed in ${LIST} but not collected by config/scripts/ci-unit-files.mjs`
      )
    }
    seen.add(path)
  }
  return problems
}

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

const paths = readFileSync(LIST, 'utf8')
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line !== '' && !line.startsWith('#'))

if (mode === 'fork-changed' || mode === 'fork-dropped') {
  const [base, ref] = rest
  // Why the seam list too: a seam test the fork no longer edits (fork cases moved to a sibling) still guards a seam.
  const seams = new Set(paths)
  const tests = [
    ...new Set([...changedSince(base, ref, 'AM').filter((path) => TEST_FILE.test(path)), ...seams])
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
              : [`not collected by ${seams.has(path) ? 'the unit runner' : 'any runner'}\t${path}`]
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
}

for (const problem of problems) {
  console.error(`fork-test-inventory: ${problem}`)
}
if (problems.length > 0) {
  process.exit(1)
} else if (mode === 'list') {
  console.log(paths.join('\n'))
}
