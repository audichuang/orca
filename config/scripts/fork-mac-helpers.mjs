// Fork-only: fails when upstream's release build (package.json `build:mac:release`) builds a macOS native helper
// that the fork Makefile's `computer-use` target, which `make fork-dmg` and `make build` depend on, does not.
// Why: only a Developer-ID release build fails on a missing helper; PR CI's ad-hoc fork-dmg skips it silently.
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const TARGET = 'computer-use'

function releaseHelperScripts(releaseScript) {
  return [...new Set(releaseScript.match(/\bbuild:[\w-]+-macos\b/g) ?? [])]
}

function makeTargetBody(makefile, target) {
  const lines = makefile.split('\n')
  const start = lines.findIndex((line) => line.startsWith(`${target}:`))
  if (start === -1) {
    return undefined
  }
  const end = lines.findIndex((line, i) => i > start && line !== '' && !line.startsWith('\t'))
  return lines
    .slice(start + 1, end === -1 ? undefined : end)
    .filter((line) => !/^\t@?#/.test(line))
    .join('\n')
}

export function forkMacHelperErrors(packageJson, makefile) {
  const releaseScript = JSON.parse(packageJson).scripts?.['build:mac:release']
  if (!releaseScript) {
    return ['fork-mac-helpers: package.json has no `build:mac:release` script to read helpers from']
  }
  const helpers = releaseHelperScripts(releaseScript)
  if (helpers.length === 0) {
    return [
      'fork-mac-helpers: `build:mac:release` runs no `build:*-macos` script; the pattern is stale'
    ]
  }
  const body = makeTargetBody(makefile, TARGET)
  if (body === undefined) {
    return [`fork-mac-helpers: Makefile has no \`${TARGET}\` target`]
  }
  return helpers
    .filter((script) => !new RegExp(`pnpm run ${script}(?![\\w-])`).test(body))
    .map(
      (script) =>
        `fork-mac-helpers: \`build:mac:release\` runs \`${script}\` but the Makefile \`${TARGET}\` target does not; fork-dmg would ship without that helper`
    )
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const errors = forkMacHelperErrors(
    readFileSync('package.json', 'utf8'),
    readFileSync('Makefile', 'utf8')
  )
  if (errors.length > 0) {
    console.error(errors.join('\n'))
    process.exit(1)
  }
  console.log(
    `fork-mac-helpers OK — Makefile \`${TARGET}\` builds every macOS helper build:mac:release builds`
  )
}
