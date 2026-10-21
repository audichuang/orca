import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { runProcess } from '@orca/process-host'
import { REQUIRED_SCRIPT, WORKFLOW, forkPrGateErrors } from './fork-pr-gate-needs.mjs'

const ROOT = join(import.meta.dirname, '..', '..')
const SCRIPT = join(import.meta.dirname, 'fork-pr-gate-needs.mjs')
const SCRIPT_DIFFERS =
  "fork-pr-gate: verify's result step script differs from REQUIRED_SCRIPT in config/scripts/fork-pr-gate-needs.mjs"

const indent = (text, spaces) =>
  text
    .trimEnd()
    .split('\n')
    .map((line) => ' '.repeat(spaces) + line)
    .join('\n')

function workflow({
  needs = '[build, test]',
  run = REQUIRED_SCRIPT,
  results = '${{ toJSON(needs) }}',
  stepControl = '',
  jobControl = '',
  header = ''
} = {}) {
  return `${header}
jobs:
  build:
    runs-on: ubuntu-24.04
    steps: [{ run: 'true' }]
  test:
    runs-on: ubuntu-24.04
    steps: [{ run: 'true' }]
  verify:
    needs: ${needs}
    if: \${{ !cancelled() }}
    runs-on: ubuntu-24.04${jobControl}
    steps:
      - name: Require every check to succeed${stepControl}
        env:
          RESULTS: ${results}
        run: |
${indent(run, 10)}
`
}

describe('forkPrGateErrors', () => {
  it('accepts a gate that needs every job and runs the required script', () => {
    expect(forkPrGateErrors(workflow())).toEqual([])
  })

  it('accepts the required script with CRLF line endings', () => {
    expect(forkPrGateErrors(workflow().replace(/\n/g, '\r\n'))).toEqual([])
  })

  it.each([
    ['a `$0` guard', `if [ "$0" != bash ]; then exit 0; fi\n${REQUIRED_SCRIPT}`],
    ['a pipe that hides jq', REQUIRED_SCRIPT.replace('> /dev/null', '| cat > /dev/null')],
    ['an `any` predicate', REQUIRED_SCRIPT.replace('all(', 'any(')],
    ['an unconditional pass', 'exit 0']
  ])('rejects any other script (%s)', (_, run) => {
    expect(forkPrGateErrors(workflow({ run }))).toEqual([SCRIPT_DIFFERS])
  })

  it.each([
    ['if', '\n        if: false'],
    ['continue-on-error', '\n        continue-on-error: true'],
    ['shell', '\n        shell: python'],
    ['timeout-minutes', '\n        timeout-minutes: 0']
  ])('rejects a result step that sets `%s`', (key, stepControl) => {
    expect(forkPrGateErrors(workflow({ stepControl }))).toEqual([
      `fork-pr-gate: verify's result step must not set \`${key}\``
    ])
  })

  it.each([
    ['continue-on-error', '\n    continue-on-error: true'],
    ['env', "\n    env: { FORK_SKIP_VERIFY: '1' }"],
    ['defaults', '\n    defaults: { run: { shell: python } }']
  ])('rejects a verify job that sets `%s`', (key, jobControl) => {
    expect(forkPrGateErrors(workflow({ jobControl }))).toEqual([
      `fork-pr-gate: verify must not set \`${key}\``
    ])
  })

  it('rejects workflow-level defaults', () => {
    const header = 'defaults:\n  run:\n    shell: python'
    expect(forkPrGateErrors(workflow({ header }))).toEqual([
      `fork-pr-gate: ${WORKFLOW} must not set \`defaults\``
    ])
  })

  it('rejects a second step', () => {
    const stepControl = "\n        run: 'true'\n      - name: second"
    expect(forkPrGateErrors(workflow({ stepControl }))).toContain(
      'fork-pr-gate: verify must have exactly one step; found 2'
    )
  })

  it('rejects extra env or a step that does not read toJSON(needs)', () => {
    const env =
      "fork-pr-gate: verify's result step env must be exactly `RESULTS: ${{ toJSON(needs) }}`"
    const extra = "${{ toJSON(needs) }}\n          FORK_SKIP_VERIFY: '1'"
    expect(forkPrGateErrors(workflow({ results: extra }))).toEqual([env])
    expect(forkPrGateErrors(workflow({ results: '${{ toJSON(github) }}' }))).toEqual([env])
  })

  it('names a job left out of verify.needs', () => {
    expect(forkPrGateErrors(workflow({ needs: '[build]' }))).toEqual([
      'fork-pr-gate: job `test` is missing from verify.needs'
    ])
  })

  it('names a need that is not a job', () => {
    expect(forkPrGateErrors(workflow({ needs: '[build, test, lint]' }))).toContain(
      'fork-pr-gate: verify.needs names `lint`, which is not a job'
    )
  })

  it.each(['\u0085', ' ', ' '])(
    'rejects a non-ASCII line separator that hides a key from the parser (%j)',
    (separator) => {
      const source = workflow().replace(
        'runs-on: ubuntu-24.04\n    steps:\n      - name',
        `runs-on: ubuntu-24.04 # note${separator}    continue-on-error: true\n    steps:\n      - name`
      )
      expect(forkPrGateErrors(source)).toEqual([
        `fork-pr-gate: ${WORKFLOW} must be ASCII; line 12 is not`
      ])
    }
  )

  it('fails once when there is no verify job', () => {
    expect(forkPrGateErrors('jobs:\n  build:\n    runs-on: ubuntu-24.04\n')).toEqual([
      `fork-pr-gate: ${WORKFLOW} has no \`verify\` job`
    ])
  })
})

// Runs REQUIRED_SCRIPT the way GitHub runs a step with no `shell:` on Linux: `bash -e {0}` on a script file,
// with `toJSON(needs)` pretty-printed.
describe('REQUIRED_SCRIPT', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fork-pr-gate-'))
  const file = join(dir, 'step.sh')
  writeFileSync(file, REQUIRED_SCRIPT)
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  const JOBS = ['fork_check_static', 'fork_e2e', 'fork_mobile_web_app']
  const runStep = async (results) =>
    (
      await runProcess({
        program: 'bash',
        args: ['--noprofile', '--norc', '-e', file],
        env: {
          PATH: process.env.PATH,
          RESULTS: JSON.stringify(
            Object.fromEntries(
              JOBS.map((job) => [job, { result: results[job] ?? 'success', outputs: {} }])
            ),
            null,
            2
          )
        }
      })
    ).code

  it('passes when every need succeeded', async () => {
    expect(await runStep({})).toBe(0)
  })

  it.each(
    JOBS.flatMap((job) => ['failure', 'skipped', 'cancelled'].map((result) => [job, result]))
  )('fails when %s is %s', async (job, result) => {
    expect(await runStep({ [job]: result })).not.toBe(0)
  })

  it('fails when several needs did not succeed', async () => {
    expect(await runStep({ fork_e2e: 'failure', fork_mobile_web_app: 'failure' })).not.toBe(0)
    expect(await runStep(Object.fromEntries(JOBS.map((job) => [job, 'skipped'])))).not.toBe(0)
  })
})

describe('fork-pr-gate-needs CLI', () => {
  it("passes on this repo's workflow", async () => {
    const result = await runProcess({ program: process.execPath, args: [SCRIPT], cwd: ROOT })
    expect(result.stderr).toBe('')
    expect(result.code).toBe(0)
  })
})
