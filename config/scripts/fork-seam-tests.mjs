// Fork test selection and collection checks.
// config/fork-seam-tests.txt groups the seam contract tests by seam, for `make fork-check-seams` and the auto-rebase
// reviewer's mutation pass; a renamed entry would drop out silently, since vitest skips an unmatched filter.
// Usage: node config/scripts/fork-seam-tests.mjs [--check <fork-base>] [--existing] [--fork-changed <fork-base> <ref>]
//   (none)          print the listed paths; fail on a missing, duplicate or uncollected entry
//   --check         validate only: the list as above, plus every test file the fork added since <fork-base> must be
//                   collected by the unit runner or be a tests/e2e spec
//   --existing      print the listed paths present here; report missing ones on stderr, exit 0 (the canary's merged tree)
//   --fork-changed  print unit test files present here that the fork added or changed between <fork-base> and <ref>
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { CROSS_VERSION_WIRE_DIR, discoverUnitFiles } from './ci-unit-files.mjs'

const LIST = 'config/fork-seam-tests.txt'
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/
const E2E_SPEC = /^tests\/e2e\/.+\.spec\.ts$/

const args = process.argv.slice(2)
const argAfter = (flag, offset = 1) => {
  const index = args.indexOf(flag)
  return index === -1 ? undefined : args[index + offset]
}
const changedSince = (base, ref, filter) =>
  execFileSync(
    'git',
    ['diff', '--name-only', '--no-renames', `--diff-filter=${filter}`, base, ref],
    {
      encoding: 'utf8',
      maxBuffer: 1 << 28
    }
  )
    .split('\n')
    .filter(Boolean)

const collected = new Set(discoverUnitFiles())

if (args.includes('--fork-changed')) {
  const base = argAfter('--fork-changed')
  const ref = argAfter('--fork-changed', 2)
  if (!base || !ref) {
    console.error('fork-seam-tests: --fork-changed needs <fork-base> <ref>')
    process.exit(2)
  }
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

const checkBase = argAfter('--check')
if (checkBase) {
  for (const path of changedSince(checkBase, 'HEAD', 'A')) {
    const runs =
      collected.has(path) || E2E_SPEC.test(path) || path.startsWith(CROSS_VERSION_WIRE_DIR)
    if (TEST_FILE.test(path) && !runs) {
      problems.push(`${path}: fork-added test that no runner collects (see ci-unit-files.mjs)`)
    }
  }
}

for (const problem of problems) {
  console.error(`fork-seam-tests: ${problem}`)
}
if (args.includes('--existing')) {
  console.log([...seen].filter((path) => collected.has(path)).join('\n'))
} else if (problems.length > 0) {
  process.exit(1)
} else if (!args.includes('--check')) {
  console.log(paths.join('\n'))
}
