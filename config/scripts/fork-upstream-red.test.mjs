import { describe, expect, it } from 'vitest'
import { EXCLUDED } from './fork-lint-run.mjs'
import { checkFailures, mentionedFiles, parseRunLintFailures } from './fork-upstream-red.mjs'

const LINT = { name: 'lint' }
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

  it('names only files that exist in the checkout, relative to its root', () => {
    const present = new Set(['/w/src/main/a.ts', '/w/.github/workflows/pr.yml'])
    const output = '/w/src/main/a.ts(3,1): error TS2322\n.github/workflows/pr.yml lacks src/gone.ts'
    expect(mentionedFiles(output, '/w', (file) => present.has(file))).toEqual([
      'src/main/a.ts',
      '.github/workflows/pr.yml'
    ])
  })
})
