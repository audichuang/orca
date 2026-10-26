// Fork-only: reads a PR's changed paths on stdin and prints `scope=docs` when every one is documentation,
// else `scope=full`. fork-pr.yml runs its heavy jobs only on `full`; its verify job accepts their skips
// only when this job succeeded and said `docs`.
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { isDocsOnlyPath } from './pr-code-change-scope.mjs'

// Why FORK.md here: it is the fork's own rules doc, which upstream's list cannot name.
const FORK_DOCS_ONLY_FILES = new Set(['FORK.md'])
// Why: build, CI and agent inputs, and docs/site (a workspace whose test script `pnpm lint` reads), always
// run everything, even if upstream's docs list grows to cover them.
const FULL_PREFIXES = ['.github/workflows/', '.claude/', 'config/', 'src/', 'mobile/', 'docs/site/']
const FULL_FILES = new Set(['Makefile', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml'])

function isForkDocsPath(file) {
  if (FULL_FILES.has(file) || FULL_PREFIXES.some((prefix) => file.startsWith(prefix))) {
    return false
  }
  return FORK_DOCS_ONLY_FILES.has(file) || isDocsOnlyPath(file)
}

export function forkPrScope(changedFiles) {
  // Why full on empty: an empty list is more likely a detector bug than a no-op PR.
  if (changedFiles.length === 0) {
    return 'full'
  }
  return changedFiles.every(isForkDocsPath) ? 'docs' : 'full'
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const files = readFileSync(0, 'utf8').split('\n').filter(Boolean)
  process.stdout.write(`scope=${forkPrScope(files)}\n`)
}
