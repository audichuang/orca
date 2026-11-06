import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { runProcess } from '@orca/process-host'
import { discoverE2eFiles } from './ci/e2e-selection/ci-e2e-shard-plan.mjs'
import { planForkE2e } from './fork-e2e-plan.mjs'

const require = createRequire(import.meta.url)

it('balances complete files while retaining nested serial tests, new tests and dedicated specs', async () => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'orca-fork-e2e-plan-')))
  const testPackage = JSON.stringify(require.resolve('@stablyai/playwright-test'))
  const config = join(directory, 'playwright.config.cjs')
  writeFileSync(
    config,
    `module.exports = { testDir: '.', fullyParallel: true, workers: 1, retries: 0, projects: [{ name: 'electron-headless', grepInvert: /@headful/ }] }`
  )
  writeFileSync(
    join(directory, 'heavy.spec.ts'),
    `const { test, expect } = require(${testPackage});
     test.describe('outer', () => {
       let progress = 0;
       test.describe.serial('serial', () => {
         test('first', () => { progress = 1; });
         test('second', () => { expect(progress).toBe(1); });
       });
       test('new in known file', () => {});
     });
     test('visible @headful', () => {});`
  )
  for (const file of ['new.spec.ts', 'workspace-layout-oracle-headless.spec.ts']) {
    writeFileSync(
      join(directory, file),
      `const { test } = require(${testPackage}); test('retained', () => {});`
    )
  }
  async function run(extra, name) {
    const output = join(directory, `${name}.json`)
    const result = await runProcess({
      program: process.execPath,
      cwd: directory,
      args: [
        require.resolve('@playwright/test/cli'),
        'test',
        '--config',
        config,
        '--reporter=json',
        ...extra
      ],
      env: { ...process.env, ORCA_BACKGROUND_LAUNCH: '1', PLAYWRIGHT_JSON_OUTPUT_FILE: output },
      timeoutMs: 20000
    })
    expect(result.code, result.stderr).toBe(0)
    return JSON.parse(readFileSync(output, 'utf8'))
  }
  try {
    const discovery = await run(['--list'], 'discovery')
    const assignment = planForkE2e(discovery, 2, {
      defaultTestDurationMs: 120000,
      timings: {
        'heavy.spec.ts › outer › serial › first': 90000,
        'heavy.spec.ts › outer › serial › second': 60000,
        'workspace-layout-oracle-headless.spec.ts › retained': 10000
      }
    })
    expect(assignment.shards).toEqual([
      { files: ['heavy.spec.ts'], durationMs: 270000 },
      {
        files: ['new.spec.ts', 'workspace-layout-oracle-headless.spec.ts'],
        durationMs: 130000
      }
    ])
    const executed = []
    for (const [index, shard] of assignment.shards.entries()) {
      const selection = join(directory, `shard-${index}.txt`)
      writeFileSync(selection, `${shard.files.join('\n')}\n`)
      const report = await run([`--test-list=${selection}`], `results-${index}`)
      expect(report.stats.skipped).toBe(0)
      executed.push(...Object.values(discoverE2eFiles(report)).flat())
    }
    expect(executed.sort()).toEqual(Object.values(discoverE2eFiles(discovery)).flat().sort())
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}, 60000)
