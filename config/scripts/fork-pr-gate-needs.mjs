// Fork-only: fails when fork-pr.yml's "Fork PR checks passed" job could pass without every other job succeeding.
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { parse } from 'yaml'
import { runProcess } from '@orca/process-host'

export const WORKFLOW = '.github/workflows/fork-pr.yml'
const GATE = 'verify'
const RESULTS_EXPRESSION = '${{toJSON(needs)}}'
const UNSUCCESSFUL = ['failure', 'skipped', 'cancelled']

function gateNeeds(gate) {
  return [gate.needs ?? []].flat()
}

function gateNeedsErrors(jobs, gate) {
  const needs = gateNeeds(gate)
  const others = Object.keys(jobs).filter((job) => job !== GATE)
  return [
    ...others
      .filter((job) => !needs.includes(job))
      .map((job) => `fork-pr-gate: job \`${job}\` is missing from ${GATE}.needs`),
    ...needs
      .filter((job) => !others.includes(job))
      .map((job) => `fork-pr-gate: ${GATE}.needs names \`${job}\`, which is not a job`)
  ]
}

// Mirrors GitHub's default `bash` run shell on Linux runners.
async function runWithBash(script, results) {
  const { code } = await runProcess({
    program: 'bash',
    args: ['--noprofile', '--norc', '-eo', 'pipefail', '-c', script],
    env: { ...process.env, RESULTS: results }
  })
  // Why: 127 is "command not found"; without jq every simulated result would read as a failing gate.
  if (code === 127) {
    throw new Error('fork-pr-gate: simulating the verify step needs bash and jq on PATH')
  }
  return code
}

function needsContext(needs, failing, result) {
  return Object.fromEntries(
    needs.map((job) => [job, { result: job === failing ? result : 'success', outputs: {} }])
  )
}

// Why execute the step instead of matching its text: any rewrite that lets a non-success through must fail here.
async function gateSuccessErrors(gate, run = runWithBash) {
  const steps = (gate.steps ?? []).filter(
    (step) => String(step.env?.RESULTS ?? '').replace(/\s+/g, '') === RESULTS_EXPRESSION
  )
  if (steps.length !== 1 || typeof steps[0].run !== 'string') {
    return [
      `fork-pr-gate: ${GATE} needs exactly one run step with \`RESULTS: \${{ toJSON(needs) }}\`; found ${steps.length}`
    ]
  }
  const [step] = steps
  if (step.shell !== undefined && step.shell !== 'bash') {
    return [
      `fork-pr-gate: ${GATE}'s result step must use the default bash shell, not ${step.shell}`
    ]
  }
  const needs = gateNeeds(gate)
  const errors = []
  if ((await run(step.run, JSON.stringify(needsContext(needs, null)))) !== 0) {
    errors.push(`fork-pr-gate: ${GATE} fails even when every need succeeded`)
  }
  for (const job of needs) {
    for (const result of UNSUCCESSFUL) {
      if ((await run(step.run, JSON.stringify(needsContext(needs, job, result)))) === 0) {
        errors.push(`fork-pr-gate: ${GATE} passes when \`${job}\` is ${result}`)
      }
    }
  }
  return errors
}

export async function forkPrGateErrors(source) {
  const jobs = parse(source)?.jobs ?? {}
  const gate = jobs[GATE]
  if (!gate) {
    return [`fork-pr-gate: ${WORKFLOW} has no \`${GATE}\` job`]
  }
  return [...gateNeedsErrors(jobs, gate), ...(await gateSuccessErrors(gate))]
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const errors = await forkPrGateErrors(readFileSync(WORKFLOW, 'utf8'))
  if (errors.length > 0) {
    console.error(errors.join('\n'))
    process.exit(1)
  }
  console.log(`fork-pr-gate OK — ${GATE} requires every other job in ${WORKFLOW} to succeed`)
}
