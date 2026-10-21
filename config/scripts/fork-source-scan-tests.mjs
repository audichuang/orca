// Fork-only: prints the unit tests that read repo files as text; `make fork-check-source-scans` runs them.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { discoverUnitFiles } from './ci-unit-files.mjs'

// scanSourceTree/readAllowlist read files for their callers (src/shared/source-scan/source-tree-scan.ts).
const READS_FILES =
  /\b(?:readFileSync|readdirSync|readFile|readdir|opendirSync|opendir|globSync|glob|scanSourceTree|readAllowlist)\s*\(|['"](?:node:)?fs\/promises['"]/
const REPO_ROOTS = 'src|resources|config|tests|docs|mobile|native|skills|\\.github'
const FROM_THE_TREE = new RegExp(
  [
    String.raw`__dirname`,
    String.raw`import\.meta\.(?:url|dirname|filename)`,
    String.raw`process\.cwd\(\)`,
    String.raw`['"\`](?:\.\/)?(?:${REPO_ROOTS})\/`,
    String.raw`['"\`](?:\.\/)?(?:package\.json|Makefile|pnpm-workspace\.yaml|pnpm-lock\.yaml|tsconfig[\w.-]*\.json|\.oxlintrc\.json)['"\`]`
  ].join('|')
)

// Upstream tests that fail on macOS hosts at the clean release tag too; Linux CI still runs them.
export const DARWIN_EXCLUDE = {
  'config/scripts/ci-managed-ssh-execution.test.mjs': 'needs bash 4 mapfile; macOS ships bash 3.2',
  'config/scripts/pr-auxiliary-preflight-admission.test.mjs':
    'bash 3.2 treats an empty array under set -u as unbound',
  'config/scripts/main-entry-facade.test.ts': 'expects /var tmpdir; macOS realpath is /private/var',
  'src/main/cli/packaged-cli-assets.test.ts': 'expects /var tmpdir; macOS realpath is /private/var',
  'config/scripts/process-host-dev-rebuild.test.ts': 'rolldown watch events differ under FSEvents',
  'src/main/worker-thread-child-process/worker-thread-child-process.test.ts':
    'a non-searchable PATH dir (/usr/local/bin) turns ENOENT into EACCES'
}

// Helpers that find the repo tree themselves (the unit-file ones only when called without a root).
const READS_THE_TREE =
  /\b(?:(?:mobileWebAppRouteClosure|mobileWebAppRouteChunkClosure)\s*\(|(?:discoverUnitFiles|collectUnitDependencyGraph)\s*\(\s*\))/

export function isSourceScan(source) {
  return READS_THE_TREE.test(source) || (READS_FILES.test(source) && FROM_THE_TREE.test(source))
}

// Why discoverUnitFiles: it applies upstream's UNIT_INCLUDE/UNIT_EXCLUDE (electron probes, real-PTY tests).
export function selectSourceScanTests({ root = process.cwd(), platform = process.platform } = {}) {
  const skipped = platform === 'darwin' ? DARWIN_EXCLUDE : {}
  return discoverUnitFiles(root).filter(
    (file) => !skipped[file] && isSourceScan(readFileSync(join(root, file), 'utf8'))
  )
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const scans = selectSourceScanTests()
  if (scans.length === 0) {
    // Why fatal: an empty file list makes vitest run the whole suite instead.
    console.error('fork-source-scan-tests: selected no tests; the detector or UNIT_INCLUDE broke')
    process.exit(1)
  }
  process.stdout.write(`${scans.join('\n')}\n`)
}
