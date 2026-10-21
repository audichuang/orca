// Fork-only: runs upstream's `pnpm lint` steps from package.json, minus EXCLUDED, stopping at the first failure.
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { runProcessSync } from '@orca/process-host'

// Steps fork-check-lint deliberately skips, with why.
export const EXCLUDED = {
  'check:path-literal-ratchet':
    "a release tag can carry main's workflow files, which name main-only paths (v1.4.230)"
}

export function parseLintSteps(lintScript) {
  return lintScript.split('&&').map((step) => step.trim())
}

function stepName(step) {
  return step.replace(/^pnpm run /, '')
}

// Throws on a stale exclusion so EXCLUDED cannot silently outlive the upstream step.
export function applyExclusions(steps, excluded = EXCLUDED) {
  const names = steps.map(stepName)
  const stale = Object.keys(excluded).filter((name) => !names.includes(name))
  if (stale.length > 0) {
    throw new Error(
      `fork-lint-run: EXCLUDED names ${stale.join(', ')}, which upstream lint no longer runs; drop it`
    )
  }
  return steps.filter((step) => !excluded[stepName(step)])
}

// Why reject shell syntax: steps run with no shell, so a step that needs one must fail loudly.
export function pnpmArgs(step) {
  if (/[|;<>&$`'"()\\]/.test(step)) {
    throw new Error(`fork-lint-run: upstream lint step \`${step}\` needs a shell; run it by hand`)
  }
  const args = step.split(/\s+/)
  return args[0] === 'pnpm' ? args.slice(1) : ['exec', ...args]
}

export function runLintSteps(steps, run) {
  for (const step of steps) {
    const args = pnpmArgs(step)
    console.log(`>> pnpm ${args.join(' ')}`)
    const code = run(args)
    if (code !== 0) {
      console.error(`fork-lint-run: \`${step}\` failed with exit code ${code}`)
      return code ?? 1
    }
  }
  return 0
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const lintScript = JSON.parse(readFileSync('package.json', 'utf8')).scripts.lint
  let steps
  try {
    steps = applyExclusions(parseLintSteps(lintScript))
    steps.forEach(pnpmArgs)
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
  process.exitCode = runLintSteps(
    steps,
    (args) => runProcessSync({ program: 'pnpm', args, stdio: 'inherit', timeoutMs: null }).code
  )
}
