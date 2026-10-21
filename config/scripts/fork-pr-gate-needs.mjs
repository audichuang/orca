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

// Why `-e` without pipefail: it is GitHub's command for a step with no `shell:` on Linux.
async function runWithBash(script, results) {
  const { code } = await runProcess({
    program: 'bash',
    args: ['--noprofile', '--norc', '-e', '-c', script],
    env: { PATH: process.env.PATH, RESULTS: results }
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

// Why allowlists: env, shell, if, continue-on-error, defaults and expressions all change what GitHub runs
// without changing what the simulation below sees.
const GATE_KEYS = ['name', 'needs', 'if', 'runs-on', 'timeout-minutes', 'steps']
const STEP_KEYS = ['name', 'env', 'run']

function gateBypassErrors(workflow, gate) {
  const errors = [
    ...(workflow.defaults === undefined
      ? []
      : [`fork-pr-gate: ${WORKFLOW} must not set \`defaults\``]),
    ...Object.keys(gate)
      .filter((key) => !GATE_KEYS.includes(key))
      .map((key) => `fork-pr-gate: ${GATE} must not set \`${key}\``)
  ]
  const steps = gate.steps ?? []
  if (steps.length !== 1) {
    return [...errors, `fork-pr-gate: ${GATE} must have exactly one step; found ${steps.length}`]
  }
  const [step] = steps
  errors.push(
    ...Object.keys(step)
      .filter((key) => !STEP_KEYS.includes(key))
      .map((key) => `fork-pr-gate: ${GATE}'s result step must not set \`${key}\``)
  )
  const env = step.env ?? {}
  if (
    Object.keys(env).join() !== 'RESULTS' ||
    String(env.RESULTS).replace(/\s+/g, '') !== RESULTS_EXPRESSION
  ) {
    errors.push(
      `fork-pr-gate: ${GATE}'s result step env must be exactly \`RESULTS: \${{ toJSON(needs) }}\``
    )
  }
  if (typeof step.run !== 'string') {
    errors.push(`fork-pr-gate: ${GATE}'s result step has no \`run\` script`)
  } else {
    if (step.run.includes('${{')) {
      errors.push(`fork-pr-gate: ${GATE}'s result step must not use \`\${{ }}\` expressions`)
    }
    const others = [...step.run.matchAll(/\$\{?([A-Za-z_]\w*)/g)]
      .map(([, name]) => name)
      .filter((name) => name !== 'RESULTS')
    if (others.length > 0) {
      errors.push(
        `fork-pr-gate: ${GATE}'s result step may read only $RESULTS, not $${[...new Set(others)].join(', $')}`
      )
    }
  }
  return errors
}

// Why execute the step instead of matching its text: any rewrite that lets a non-success through must fail here.
async function gateSuccessErrors(gate, run = runWithBash) {
  const script = gate.steps[0].run
  const needs = gateNeeds(gate)
  const errors = []
  if ((await run(script, JSON.stringify(needsContext(needs, null)))) !== 0) {
    errors.push(`fork-pr-gate: ${GATE} fails even when every need succeeded`)
  }
  for (const job of needs) {
    for (const result of UNSUCCESSFUL) {
      if ((await run(script, JSON.stringify(needsContext(needs, job, result)))) === 0) {
        errors.push(`fork-pr-gate: ${GATE} passes when \`${job}\` is ${result}`)
      }
    }
  }
  return errors
}

export async function forkPrGateErrors(source) {
  const workflow = parse(source) ?? {}
  const jobs = workflow.jobs ?? {}
  const gate = jobs[GATE]
  if (!gate) {
    return [`fork-pr-gate: ${WORKFLOW} has no \`${GATE}\` job`]
  }
  const bypasses = gateBypassErrors(workflow, gate)
  if (bypasses.length > 0) {
    return [...gateNeedsErrors(jobs, gate), ...bypasses]
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
