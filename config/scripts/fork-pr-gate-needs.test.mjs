import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runProcess } from '@orca/process-host'
import { WORKFLOW, forkPrGateErrors } from './fork-pr-gate-needs.mjs'

const ROOT = join(import.meta.dirname, '..', '..')
const SCRIPT = join(import.meta.dirname, 'fork-pr-gate-needs.mjs')
const REQUIRE_ALL = `echo "$RESULTS" | jq -e 'to_entries | all(.value.result == "success")' > /dev/null`

function workflow({
  needs = '[build, test]',
  run = REQUIRE_ALL,
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
          ${run}
`
}

describe('forkPrGateErrors', () => {
  it.each([
    ['if', '\n        if: false'],
    ['continue-on-error', '\n        continue-on-error: true'],
    ['shell', '\n        shell: python'],
    ['timeout-minutes', '\n        timeout-minutes: 0']
  ])('rejects a result step that sets `%s`', async (key, stepControl) => {
    expect(await forkPrGateErrors(workflow({ stepControl }))).toEqual([
      `fork-pr-gate: verify's result step must not set \`${key}\``
    ])
  })

  it.each([
    ['continue-on-error', '\n    continue-on-error: true'],
    ['env', "\n    env: { FORK_SKIP_VERIFY: '1' }"],
    ['defaults', '\n    defaults: { run: { shell: python } }']
  ])('rejects a verify job that sets `%s`', async (key, jobControl) => {
    expect(await forkPrGateErrors(workflow({ jobControl }))).toEqual([
      `fork-pr-gate: verify must not set \`${key}\``
    ])
  })

  it('rejects workflow-level defaults', async () => {
    const header = 'defaults:\n  run:\n    shell: python'
    expect(await forkPrGateErrors(workflow({ header }))).toEqual([
      'fork-pr-gate: .github/workflows/fork-pr.yml must not set `defaults`'
    ])
  })

  it('rejects a second step', async () => {
    const stepControl = "\n        run: 'true'\n      - name: second"
    expect(await forkPrGateErrors(workflow({ stepControl }))).toContain(
      'fork-pr-gate: verify must have exactly one step; found 2'
    )
  })

  it('rejects extra env, expressions and other variables in the result step', async () => {
    const results = "${{ toJSON(needs) }}\n          FORK_SKIP_VERIFY: '1'"
    expect(await forkPrGateErrors(workflow({ results }))).toEqual([
      "fork-pr-gate: verify's result step env must be exactly `RESULTS: ${{ toJSON(needs) }}`"
    ])
    const skip = `if [ "\${FORK_SKIP_VERIFY:-}" = 1 ]; then exit 0; fi; ${REQUIRE_ALL}`
    expect(await forkPrGateErrors(workflow({ run: skip }))).toEqual([
      "fork-pr-gate: verify's result step may read only $RESULTS, not $FORK_SKIP_VERIFY"
    ])
    const event = `[ "\${{ github.event_name }}" = push ] || ${REQUIRE_ALL}`
    expect(await forkPrGateErrors(workflow({ run: event }))).toEqual([
      "fork-pr-gate: verify's result step must not use `${{ }}` expressions"
    ])
  })

  it('simulates without pipefail, as GitHub runs a step with no shell', async () => {
    const errors = await forkPrGateErrors(workflow({ run: `${REQUIRE_ALL} | cat >/dev/null` }))
    expect(errors).toContain('fork-pr-gate: verify passes when `build` is failure')
  })

  it('accepts a gate that needs every job and requires each to succeed', async () => {
    expect(await forkPrGateErrors(workflow())).toEqual([])
  })

  it('names a job left out of verify.needs', async () => {
    expect(await forkPrGateErrors(workflow({ needs: '[build]' }))).toEqual([
      'fork-pr-gate: job `test` is missing from verify.needs'
    ])
  })

  it('names a need that is not a job', async () => {
    expect(await forkPrGateErrors(workflow({ needs: '[build, test, lint]' }))).toContain(
      'fork-pr-gate: verify.needs names `lint`, which is not a job'
    )
  })

  it('fails when one successful need is enough', async () => {
    const errors = await forkPrGateErrors(workflow({ run: REQUIRE_ALL.replace('all(', 'any(') }))
    expect(errors).toContain('fork-pr-gate: verify passes when `build` is failure')
    expect(errors).toContain('fork-pr-gate: verify passes when `test` is skipped')
  })

  it('fails when the result step ignores the results', async () => {
    const errors = await forkPrGateErrors(workflow({ run: 'exit 0' }))
    // Every job × every non-success result must be reported.
    expect(errors).toHaveLength(6)
    expect(errors).toContain('fork-pr-gate: verify passes when `build` is failure')
  })

  it('fails when a skipped need counts as passing', async () => {
    const run = `echo "$RESULTS" | jq -e 'to_entries | all(.value.result == "success" or .value.result == "skipped")' > /dev/null`
    expect(await forkPrGateErrors(workflow({ run }))).toEqual([
      'fork-pr-gate: verify passes when `build` is skipped',
      'fork-pr-gate: verify passes when `test` is skipped'
    ])
  })

  it('fails once when there is no verify job', async () => {
    expect(await forkPrGateErrors('jobs:\n  build:\n    runs-on: ubuntu-24.04\n')).toEqual([
      `fork-pr-gate: ${WORKFLOW} has no \`verify\` job`
    ])
  })

  it('fails when the step does not read toJSON(needs)', async () => {
    expect(await forkPrGateErrors(workflow({ results: '${{ toJSON(github) }}' }))).toEqual([
      "fork-pr-gate: verify's result step env must be exactly `RESULTS: ${{ toJSON(needs) }}`"
    ])
  })
})

describe('fork-pr-gate-needs CLI', () => {
  it("passes on this repo's workflow", async () => {
    const result = await runProcess({ program: process.execPath, args: [SCRIPT], cwd: ROOT })
    expect(result.stderr).toBe('')
    expect(result.code).toBe(0)
  })
})
