// Fork-only: fails when upstream's `pnpm lint` has a check `make fork-check-lint` neither runs nor excludes.
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

// Checks fork-check-lint deliberately skips, with why.
export const EXCLUDED = {
  'check:path-literal-ratchet':
    "a release tag can carry main's workflow files, which name main-only paths (v1.4.230)"
}

// Why the prerequisite: a target-specific variable line (`fork-check-lint: export X = Y`) also starts with the name.
const TARGET_LINE = 'fork-check-lint: fork-base-guard'

export function forkCheckLintRecipe(makefile) {
  const lines = makefile.split('\n')
  const start = lines.findIndex((line) => line.trimEnd() === TARGET_LINE)
  if (start === -1) {
    return null
  }
  const body = lines.slice(start + 1)
  const end = body.findIndex((line) => !line.startsWith('\t'))
  return (end === -1 ? body : body.slice(0, end))
    .map((line) => line.trim().replace(/^@\s*/, ''))
    .filter((line) => line !== '' && !line.startsWith('#'))
}

export function lintParityErrors({ lintScript, makefile, excluded = EXCLUDED }) {
  const recipe = forkCheckLintRecipe(makefile)
  if (!recipe || recipe.length === 0) {
    return [`fork-lint-parity: no \`${TARGET_LINE}\` recipe found in Makefile`]
  }
  const lintSteps = lintScript.split('&&').map((step) => step.trim())
  const missing = lintSteps.filter((step) => {
    const name = step.replace(/^pnpm run /, '')
    return !excluded[name] && !recipe.some((line) => line === step || line === `pnpm exec ${step}`)
  })
  const stale = Object.keys(excluded).filter((name) => !lintSteps.includes(`pnpm run ${name}`))
  return [
    ...missing.map(
      (step) =>
        `fork-lint-parity: upstream lint runs \`${step}\`; add it to fork-check-lint or to EXCLUDED with a reason`
    ),
    ...stale.map(
      (name) =>
        `fork-lint-parity: EXCLUDED names ${name}, which upstream lint no longer runs; drop it`
    )
  ]
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const lintScript = JSON.parse(readFileSync('package.json', 'utf8')).scripts.lint
  const errors = lintParityErrors({ lintScript, makefile: readFileSync('Makefile', 'utf8') })
  if (errors.length > 0) {
    console.error(errors.join('\n'))
    process.exit(1)
  }
  console.log(
    `fork-lint-parity OK — ${lintScript.split('&&').length} upstream lint steps, ${Object.keys(EXCLUDED).length} excluded`
  )
}
