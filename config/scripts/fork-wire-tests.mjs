import { globSync } from 'node:fs'
import { CROSS_VERSION_WIRE_DIR } from './ci/unit-selection/dependency-graph/ci-unit-files.mjs'

// Why skipped: at the fork base this upstream test reads isStructuredTab from a module that no longer exports it.
export const WIRE_SKIPPED = 'cross-version-registered-agents.unit.test.ts'

export function wireTests(root = '.') {
  return globSync(`${CROSS_VERSION_WIRE_DIR}**/*.test.ts`, { cwd: root })
    .map((file) => file.replaceAll('\\', '/'))
    .filter((file) => file.split('/').at(-1) !== WIRE_SKIPPED)
    .sort()
}
