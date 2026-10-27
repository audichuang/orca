// Fork-only: runs upstream's `pnpm lint` steps (run-lint.mjs LINT_STEPS) one at a time, minus EXCLUDED, naming every failing step so one round shows them all.
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { runProcessSync } from '@orca/process-host'
import { LINT_STEPS, resolveLintCommands } from './run-lint.mjs'

// Steps fork-check-lint deliberately skips, with why.
export const EXCLUDED = {
  'check:path-literal-ratchet':
    "a release tag can carry main's workflow files, which name main-only paths (v1.4.230)"
}

// Throws on a stale exclusion so EXCLUDED cannot silently outlive the upstream step.
export function applyExclusions(steps, excluded = EXCLUDED) {
  const stale = Object.keys(excluded).filter((name) => !steps.includes(name))
  if (stale.length > 0) {
    throw new Error(
      `fork-lint-run: EXCLUDED names ${stale.join(', ')}, which upstream lint no longer runs; drop it`
    )
  }
  return steps.filter((name) => !excluded[name])
}

// Why reject shell syntax: steps run with no shell, so a step that needs one must fail loudly.
export function pnpmArgs(step) {
  if (/[|;<>&$`'"()\\]/.test(step)) {
    throw new Error(`fork-lint-run: upstream lint step \`${step}\` needs a shell; run it by hand`)
  }
  const args = step.split(/\s+/)
  return args[0] === 'pnpm' ? args.slice(1) : ['exec', ...args]
}

// Package scripts run through `pnpm run`; run-lint.mjs's bare commands through `pnpm exec`.
export function lintStepArgs({ name, command }, scripts) {
  return scripts[name] ? ['run', name] : pnpmArgs(command)
}

export function runLintSteps(steps, run) {
  const failed = []
  for (const { name, args } of steps) {
    console.log(`>> pnpm ${args.join(' ')}`)
    const code = run(args) ?? 1
    if (code !== 0) {
      console.error(`fork-lint-run: \`${name}\` failed with exit code ${code}`)
      failed.push({ name, code })
    }
  }
  if (failed.length === 0) {
    return 0
  }
  console.error(
    `fork-lint-run: ${failed.length} step(s) failed: ${failed.map(({ name }) => name).join(', ')}`
  )
  return failed[0].code
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { scripts } = JSON.parse(readFileSync('package.json', 'utf8'))
  let steps
  try {
    steps = resolveLintCommands(scripts, applyExclusions(LINT_STEPS)).map((step) => ({
      name: step.name,
      args: lintStepArgs(step, scripts)
    }))
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
  process.exitCode = runLintSteps(
    steps,
    (args) => runProcessSync({ program: 'pnpm', args, stdio: 'inherit', timeoutMs: null }).code
  )
}
