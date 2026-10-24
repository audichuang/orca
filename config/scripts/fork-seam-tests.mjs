// Reads config/fork-seam-tests.txt and prints its test paths, one per line.
// Why fail on a missing or uncollected path: vitest skips an unmatched filter silently, so a renamed seam test would drop out.
// Usage: node config/scripts/fork-seam-tests.mjs [--check] [--existing]
//   --check     validate only, print nothing on success
//   --existing  print only paths that exist and report missing ones on stderr (exit 0), for the canary's merged tree
import { existsSync, readFileSync } from 'node:fs'
import { discoverUnitFiles } from './ci-unit-files.mjs'

const LIST = 'config/fork-seam-tests.txt'

const args = process.argv.slice(2)
const paths = readFileSync(LIST, 'utf8')
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line !== '' && !line.startsWith('#'))

const collected = new Set(discoverUnitFiles())
const problems = []
const seen = new Set()
for (const path of paths) {
  if (seen.has(path)) {
    problems.push(`${path}: listed twice`)
  } else if (!existsSync(path)) {
    problems.push(`${path}: missing (renamed or deleted?)`)
  } else if (!collected.has(path)) {
    problems.push(
      `${path}: not collected by UNIT_INCLUDE/UNIT_EXCLUDE in config/scripts/ci-unit-files.mjs`
    )
  }
  seen.add(path)
}

if (args.includes('--existing')) {
  for (const problem of problems) {
    console.error(`fork-seam-tests: ${problem}`)
  }
  console.log([...seen].filter((path) => collected.has(path)).join('\n'))
} else if (problems.length > 0) {
  for (const problem of problems) {
    console.error(`fork-seam-tests: ${problem}`)
  }
  console.error(`fork-seam-tests: fix ${LIST}`)
  process.exit(1)
} else if (!args.includes('--check')) {
  console.log(paths.join('\n'))
}
