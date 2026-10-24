// Fork footprint: how much of upstream the fork touches versus FORK_BASE, so rebase cost is visible per release.
// Usage: node config/scripts/fork-footprint.mjs <fork-base> [--json]
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const CATEGORIES = ['production', 'test', 'locale', 'baseline', 'other']
const CODE_FILE = /\.(c|m)?(j|t)sx?$/

export function classifyUpstreamFile(path) {
  if (path.startsWith('src/renderer/src/i18n/')) {
    return 'locale'
  }
  if (/^config\/[^/]*-baseline\.txt$/.test(path) || path.endsWith('-dispositions.ts')) {
    return 'baseline'
  }
  if (/\.(test|spec)\.[^/]*$/.test(path) || path.startsWith('tests/') || path.includes('/tests/')) {
    return 'test'
  }
  if (CODE_FILE.test(path) && !path.startsWith('.github/')) {
    return 'production'
  }
  return 'other'
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 28 })
}

function footprint(base) {
  const added = git(['diff', '--name-only', '--no-renames', '--diff-filter=A', base, 'HEAD'])
    .split('\n')
    .filter(Boolean).length
  const modified = Object.fromEntries(
    CATEGORIES.map((name) => [name, { files: 0, added: 0, removed: 0 }])
  )
  let modifiedFiles = 0
  const numstat = git(['diff', '--numstat', '--no-renames', '--diff-filter=MD', base, 'HEAD'])
  for (const line of numstat.split('\n').filter(Boolean)) {
    const [plus, minus, path] = line.split('\t')
    const bucket = modified[classifyUpstreamFile(path)]
    bucket.files += 1
    // Why: binary files report "-" instead of line counts.
    bucket.added += Number(plus) || 0
    bucket.removed += Number(minus) || 0
    modifiedFiles += 1
  }
  return {
    base,
    head: git(['rev-parse', '--short', 'HEAD']).trim(),
    added,
    modifiedFiles,
    modified
  }
}

function main() {
  const args = process.argv.slice(2)
  const base = args.find((arg) => !arg.startsWith('--'))
  if (!base) {
    console.error('usage: node config/scripts/fork-footprint.mjs <fork-base> [--json]')
    process.exit(2)
  }
  const result = footprint(base)
  if (args.includes('--json')) {
    console.log(JSON.stringify(result, null, 2))
    return
  }
  console.log(`fork footprint ${result.base}..${result.head}`)
  console.log(`  fork-added files:        ${result.added}`)
  console.log(`  modified upstream files: ${result.modifiedFiles}`)
  for (const name of CATEGORIES) {
    const { files, added, removed } = result.modified[name]
    console.log(
      `    ${name.padEnd(11)} ${String(files).padStart(4)} files  +${added} -${removed}  (${added + removed} lines)`
    )
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main()
}
