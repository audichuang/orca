import { discoverE2eFiles } from './ci/e2e-selection/ci-e2e-shard-plan.mjs'
import { balanceFiles } from './ci/sharding/ci-shard-assignment.mjs'

export function planForkE2e(report, count, baseline) {
  const testsByFile = discoverE2eFiles(report)
  const timings = Object.fromEntries(Object.keys(testsByFile).map((file) => [file, 0]))
  function visit(suite, titles) {
    for (const spec of suite.specs ?? []) {
      const file = spec.file.replaceAll('\\', '/')
      const key = `${file} › ${[...titles, spec.title].join(' › ')}`
      timings[file] += (baseline.timings[key] ?? baseline.defaultTestDurationMs) * spec.tests.length
    }
    for (const child of suite.suites ?? []) {
      visit(child, [...titles, child.title])
    }
  }
  for (const suite of report.suites) {
    visit(suite, [])
  }
  return { ...balanceFiles(Object.keys(testsByFile), count, timings), testsByFile }
}
