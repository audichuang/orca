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
  results = '${{ toJSON(needs) }}'
} = {}) {
  return `
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
    runs-on: ubuntu-24.04
    steps:
      - name: Require every check to succeed
        env:
          RESULTS: ${results}
        run: |
          ${run}
`
}

describe('forkPrGateErrors', () => {
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

  it('fails when no step reads toJSON(needs)', async () => {
    expect(await forkPrGateErrors(workflow({ results: '${{ toJSON(github) }}' }))).toEqual([
      'fork-pr-gate: verify needs exactly one run step with `RESULTS: ${{ toJSON(needs) }}`; found 0'
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
