import { describe, expect, it } from 'vitest'
import { EXCLUDED } from './fork-lint-run.mjs'
import {
  checkFailures,
  mentionedFiles,
  parseRunLintFailures,
  parseVitestFailures
} from './fork-upstream-red.mjs'

const LINT = { name: 'lint' }
const WORKFLOW_TESTS = { name: 'workflow-tests' }
const VITEST_REPORT = JSON.stringify({
  testResults: [
    {
      name: '/w/config/scripts/a.test.mjs',
      status: 'failed',
      message: '',
      assertionResults: [
        { status: 'passed', fullName: 'a passes', failureMessages: [] },
        {
          status: 'failed',
          fullName: 'a reads the workflow',
          failureMessages: ['AssertionError: expected 1 to be 2\n\n    at a.test.mjs:9']
        }
      ]
    },
    {
      name: '/w/config/scripts/b.test.mjs',
      status: 'failed',
      message: "Error: Cannot find module '/w/config/scripts/gone.mjs'\nat load",
      assertionResults: []
    },
    {
      name: '/w/config/scripts/c.test.mjs',
      status: 'passed',
      message: '',
      assertionResults: [{ status: 'passed', fullName: 'c passes', failureMessages: [] }]
    }
  ]
})

const excludedStep = Object.keys(EXCLUDED)[0]

// Shape run-lint.mjs prints: a `✗ <step> (<secs>)` block per failure, then one summary line.
const RUN_LINT_OUTPUT = [
  '',
  '✗ check:test-file-runners (2.1s)',
  'Runner list is out of date: .github/workflows/pr.yml do not contain "src/main/a.electron.test.ts"',
  '',
  `✗ ${excludedStep} (0.4s)`,
  'config/scripts/x.mjs names a main-only path',
  '',
  `✗ 2 of 35 lint step(s) failed in 20.1s: check:test-file-runners, ${excludedStep}`
].join('\n')

describe('fork-upstream-red', () => {
  it('splits run-lint output into one failure per step and flags the steps fork-check-lint skips', () => {
    expect(checkFailures(LINT, { code: 1, stdout: '', stderr: RUN_LINT_OUTPUT })).toEqual([
      {
        step: 'check:test-file-runners',
        output:
          'Runner list is out of date: .github/workflows/pr.yml do not contain "src/main/a.electron.test.ts"',
        forkSkips: false
      },
      { step: excludedStep, output: 'config/scripts/x.mjs names a main-only path', forkSkips: true }
    ])
  })

  it('reports a lint failure it cannot parse as red, never as green', () => {
    expect(parseRunLintFailures('lint crashed before the summary')).toBeNull()
    expect(checkFailures(LINT, { code: 1, stdout: 'lint crashed', stderr: '' })).toEqual([
      { step: 'lint', output: 'lint crashed', forkSkips: false }
    ])
  })

  it('names the files a failure points at that exist in the checkout, not the command pnpm echoes', () => {
    const present = new Set([
      '/w/src/main/a.ts',
      '/w/.github/workflows/pr.yml',
      '/w/config/scripts/typecheck/project-execution/run-typecheck-projects-in-parallel.mjs'
    ])
    const output = [
      '$ node config/scripts/typecheck/project-execution/run-typecheck-projects-in-parallel.mjs',
      '/w/src/main/a.ts(3,1): error TS2322',
      '.github/workflows/pr.yml lacks src/gone.ts'
    ].join('\n')
    expect(mentionedFiles(output, '/w', (file) => present.has(file))).toEqual([
      'src/main/a.ts',
      '.github/workflows/pr.yml'
    ])
  })

  it('turns a vitest report into one failure per failing file and drops the passing ones', () => {
    expect(parseVitestFailures(VITEST_REPORT, '/w')).toEqual([
      {
        step: 'config/scripts/a.test.mjs',
        file: 'config/scripts/a.test.mjs',
        output: 'a reads the workflow\nAssertionError: expected 1 to be 2'
      },
      {
        step: 'config/scripts/b.test.mjs',
        file: 'config/scripts/b.test.mjs',
        output: "Error: Cannot find module '/w/config/scripts/gone.mjs'\nat load"
      }
    ])
    expect(
      checkFailures(
        WORKFLOW_TESTS,
        { code: 1, stdout: '', stderr: '' },
        { root: '/w', report: VITEST_REPORT }
      ).map(({ step, forkSkips }) => [step, forkSkips])
    ).toEqual([
      ['workflow-tests: config/scripts/a.test.mjs', false],
      ['workflow-tests: config/scripts/b.test.mjs', false]
    ])
  })

  it('reports a vitest failure it cannot parse as red, never as green', () => {
    expect(parseVitestFailures('not json', '/w')).toBeNull()
    for (const report of ['not json', JSON.stringify({ testResults: [] })]) {
      expect(
        checkFailures(
          WORKFLOW_TESTS,
          { code: 1, stdout: 'vitest crashed', stderr: '' },
          { root: '/w', report }
        )
      ).toEqual([{ step: 'workflow-tests', output: 'vitest crashed', forkSkips: false }])
    }
  })
})
