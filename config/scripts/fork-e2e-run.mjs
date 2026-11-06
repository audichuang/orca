import { deepStrictEqual, strictEqual } from 'node:assert'
import { mkdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { runProcessSync } from '@orca/process-host'
import { discoverE2eFiles } from './ci/e2e-selection/ci-e2e-shard-plan.mjs'

const require = createRequire(import.meta.url)
const cli = require.resolve('@playwright/test/cli')
const input = process.argv.slice(2)
const shard = input.find((arg) => arg.startsWith('--shard='))?.slice('--shard='.length) ?? '1/1'
const match = shard.match(/^([1-9]\d*)\/([1-9]\d*)$/)
if (!match || Number(match[1]) > Number(match[2])) {
  throw new Error(`Invalid fork E2E shard: ${shard}`)
}
const index = Number(match[1])
const count = Number(match[2])
const listOnly = input.includes('--list')
const specs = input.filter((arg) => !arg.startsWith('--'))
if (specs.length === 0) {
  throw new Error('Usage: fork-e2e-run.mjs SPEC... [--shard=INDEX/COUNT] [--list]')
}
const directory = resolve('out/fork-e2e', `${index}-of-${count}`)
mkdirSync(directory, { recursive: true })
const args = [
  'test',
  ...specs,
  '--config=tests/playwright.config.ts',
  '--project=electron-headless',
  '--workers=1'
]

function runPlaywright(extra, name) {
  const output = join(directory, `${name}.json`)
  const result = runProcessSync({
    program: process.execPath,
    args: [cli, ...args, ...extra],
    env: { ...process.env, ORCA_BACKGROUND_LAUNCH: '1', PLAYWRIGHT_JSON_OUTPUT_FILE: output },
    stdio: 'inherit',
    timeoutMs: null
  })
  if (result.code !== 0) {
    process.exit(result.code ?? 1)
  }
  return JSON.parse(readFileSync(output, 'utf8'))
}

function testIds(report) {
  return Object.values(discoverE2eFiles(report)).flat().sort()
}

const full = testIds(runPlaywright(['--list', '--reporter=json'], 'full-list'))
const shards = []
for (let part = 1; part <= count; part++) {
  const ids = testIds(
    runPlaywright(['--list', '--reporter=json', `--shard=${part}/${count}`], `shard-${part}-list`)
  )
  console.log(`>> fork e2e shard ${part}/${count}: ${ids.length} test IDs\n${ids.join('\n')}`)
  shards.push(ids)
}
const assigned = shards.flat().sort()
strictEqual(new Set(assigned).size, assigned.length, 'Duplicate test IDs across fork E2E shards')
deepStrictEqual(assigned, full, 'Fork E2E shard union differs from full --list')
console.log(`>> fork e2e coverage: ${full.length} test IDs, each assigned exactly once`)

if (!listOnly) {
  const report = runPlaywright([`--shard=${shard}`, '--reporter=list,json'], 'results')
  deepStrictEqual(
    testIds(report),
    shards[index - 1],
    'Executed fork E2E IDs differ from shard --list'
  )
  strictEqual(report.stats.skipped, 0, 'Fork E2E tests were skipped during execution')
  console.log(
    `>> fork e2e executed ${shards[index - 1].length}/${full.length} test IDs on shard ${shard}`
  )
}
