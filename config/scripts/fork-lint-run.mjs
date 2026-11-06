// Fork-only pool adapted from config/scripts/preflight/changed-checks/run-lint.mjs to avoid upstream export changes.
import { runProcess } from '@orca/process-host'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { quotePosixShellUnlessPlain } from '../../src/shared/shell/launch/shell-argument-quoting.ts'
import { LINT_STEPS } from './preflight/changed-checks/run-lint.mjs'
import { resolveOxlintInvocation } from './tool-invocation/oxlint-cli-invocation.mjs'
import { resolvePnpmCliInvocation } from './tool-invocation/pnpm-cli-invocation.mjs'

// Steps fork-check-lint deliberately skips, with why.
export const EXCLUDED = {
  'check:path-literal-ratchet':
    "a release tag can carry main's workflow files, which name main-only paths (v1.4.230)"
}

// Run 42228204045 timings predict 98.5s here and 133.5s for the remainder, with two workers each.
const FIRST_SHARD_STEPS = [
  'audit:code-quality:type-aware',
  'verify:localization-catalogs',
  'lint:ast-grep-gates',
  'verify:skill-bundle-manifest'
]

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

export function selectLintShard(steps, shard) {
  if (shard === undefined) {
    return steps
  }
  if (shard !== '1/2' && shard !== '2/2') {
    throw new Error('fork-lint-run: --shard must be 1/2 or 2/2.')
  }
  const stale = FIRST_SHARD_STEPS.filter((name) => !steps.includes(name))
  if (stale.length > 0) {
    throw new Error(
      `fork-lint-run: upstream lint no longer runs ${stale.join(', ')}; rebalance shards`
    )
  }
  // New upstream steps join shard 2 automatically; neither shard can drop them.
  return steps.filter((name) => FIRST_SHARD_STEPS.includes(name) === (shard === '1/2'))
}

function resolveLintCommands(steps, scripts, root) {
  const pnpm = resolvePnpmCliInvocation()
  return steps.map((name) => {
    if (name === 'oxlint') {
      const { command, prefixArgs } = resolveOxlintInvocation(root)
      return { name, program: command, args: prefixArgs }
    }
    if (!scripts[name]) {
      throw new Error(`Lint step ${name} has no package.json script.`)
    }
    return { name, program: pnpm.command, args: [...pnpm.prefixArgs, 'run', name] }
  })
}

async function runStep({ name, program, args }, root) {
  const startedAt = performance.now()
  try {
    const result = await runProcess({ program, args, cwd: root, timeoutMs: null }, 'tail')
    return {
      name,
      ok: result.code === 0 && !result.signal && !result.timedOut,
      output: result.stdout + result.stderr,
      elapsed: `${((performance.now() - startedAt) / 1000).toFixed(1)}s`
    }
  } catch (error) {
    return { name, ok: false, output: error.message ?? String(error), elapsed: 'failed to start' }
  }
}

export async function runLintSteps(steps, root = process.cwd(), argv = []) {
  const startedAt = performance.now()
  let concurrency = 2
  let shard
  for (const argument of argv) {
    if (argument === '--' || argument === '--timings') {
      continue
    }
    if (/^--max-?workers=[1-9]\d*$/i.test(argument)) {
      concurrency = Number(argument.split('=')[1])
    } else if (argument.startsWith('--shard=')) {
      shard = argument.slice('--shard='.length)
    } else {
      throw new Error(
        `Unknown option ${argument}. Use --maxWorkers=<n>, --timings or --shard=<1/2|2/2>.`
      )
    }
  }
  const names = selectLintShard(applyExclusions(steps), shard)
  const { scripts } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
  const commands = resolveLintCommands(names, scripts, root)
  const results = []
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(concurrency, commands.length) }, async () => {
      while (next < commands.length) {
        const index = next++
        results[index] = await runStep(commands[index], root)
      }
    })
  )
  for (const [index, result] of results.entries()) {
    if (!result.ok) {
      const { program, args } = commands[index]
      const command =
        result.name === 'oxlint'
          ? [program, ...args].map(quotePosixShellUnlessPlain).join(' ')
          : `pnpm run ${quotePosixShellUnlessPlain(result.name)}`
      console.error(
        `\n✗ ${result.name} (${result.elapsed})\n>> ${command}\n${result.output.trimEnd()}`
      )
    } else {
      console.log(`✓ ${result.name} (${result.elapsed})`)
    }
  }
  const failed = results.filter((result) => !result.ok)
  const elapsed = `${((performance.now() - startedAt) / 1000).toFixed(1)}s`
  if (failed.length > 0) {
    console.error(
      `\n✗ ${failed.length} of ${results.length} lint step(s) failed in ${elapsed}: ${failed.map((result) => result.name).join(', ')}`
    )
    return 1
  }
  console.log(`✓ ${results.length} lint step(s) passed in ${elapsed}.`)
  return 0
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    process.exitCode = await runLintSteps(LINT_STEPS, process.cwd(), process.argv.slice(2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
