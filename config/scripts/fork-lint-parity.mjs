// Fork-only: fails when upstream's `pnpm lint` has a check that `make fork-check-lint` neither runs
// nor lists below, so a check upstream added in an earlier release can't stay missing.
import { readFileSync } from 'node:fs'

// Checks fork-check-lint deliberately skips, with why.
const EXCLUDED = {
  'check:path-literal-ratchet':
    "a release tag can carry main's workflow files, which name main-only paths (v1.4.230)"
}

const lintSteps = JSON.parse(readFileSync('package.json', 'utf8'))
  .scripts.lint.split('&&')
  .map((step) => step.trim())
const makefile = readFileSync('Makefile', 'utf8')
const start = makefile.indexOf('\nfork-check-lint:')
const recipe = makefile
  .slice(start + 1)
  .split('\n')
  .slice(1)
  .filter((line, index, lines) => lines.slice(0, index + 1).every((l) => l.startsWith('\t')))
  .map((line) => line.trim())

const missing = lintSteps.filter((step) => {
  const name = step.replace(/^pnpm run /, '')
  return !EXCLUDED[name] && !recipe.some((line) => line === step || line === `pnpm exec ${step}`)
})
const stale = Object.keys(EXCLUDED).filter((name) => !lintSteps.includes(`pnpm run ${name}`))

if (start === -1 || recipe.length === 0) {
  console.error('fork-lint-parity: no fork-check-lint recipe found in Makefile')
  process.exit(1)
}
if (missing.length > 0 || stale.length > 0) {
  for (const step of missing) {
    console.error(
      `fork-lint-parity: upstream lint runs \`${step}\`; add it to fork-check-lint or to EXCLUDED with a reason`
    )
  }
  for (const name of stale) {
    console.error(
      `fork-lint-parity: EXCLUDED names ${name}, which upstream lint no longer runs; drop it`
    )
  }
  process.exit(1)
}
console.log(
  `fork-lint-parity OK — ${lintSteps.length} upstream lint steps, ${Object.keys(EXCLUDED).length} excluded`
)
