// Fork-only: fails when fork-pr.yml's "Fork PR checks passed" job could pass without every other job succeeding.
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { parse } from 'yaml'

export const WORKFLOW = '.github/workflows/fork-pr.yml'
const GATE = 'verify'
const RESULTS_EXPRESSION = '${{toJSON(needs)}}'

// Why pinned text instead of validating any script: three Codex rounds kept finding scripts that pass a
// simulation but not GitHub ($0, printenv, JSON formatting, multi-failure predicates). Changing the check
// now means changing this constant, which review sees; fork-pr-gate-needs.test.mjs proves it rejects failures.
export const REQUIRED_SCRIPT = `echo "$RESULTS" | jq -e 'to_entries | all(.value.result == "success")' > /dev/null || {
  echo "$RESULTS" | jq -r 'to_entries[] | "\\(.key): \\(.value.result)"'
  echo "::error::A fork PR check did not succeed."
  exit 1
}
`

// Why allowlists: env, shell, if, continue-on-error and defaults all change what GitHub runs.
const GATE_KEYS = ['name', 'needs', 'if', 'runs-on', 'timeout-minutes', 'steps']
const STEP_KEYS = ['name', 'env', 'run']

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

function gateStepErrors(workflow, gate) {
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
  if (String(step.run ?? '').replace(/\r\n/g, '\n') !== REQUIRED_SCRIPT) {
    errors.push(
      `fork-pr-gate: ${GATE}'s result step script differs from REQUIRED_SCRIPT in config/scripts/fork-pr-gate-needs.mjs`
    )
  }
  return errors
}

export function forkPrGateErrors(source) {
  // Why: the `yaml` package and GitHub's parser split lines differently on U+0085/U+2028/U+2029, so a key
  // hidden from this check could still run on GitHub.
  const nonAscii = [...source].findIndex((c) => c.charCodeAt(0) > 0x7f)
  if (nonAscii !== -1) {
    const line = source.slice(0, nonAscii).split('\n').length
    return [`fork-pr-gate: ${WORKFLOW} must be ASCII; line ${line} is not`]
  }
  const workflow = parse(source) ?? {}
  const jobs = workflow.jobs ?? {}
  const gate = jobs[GATE]
  if (!gate) {
    return [`fork-pr-gate: ${WORKFLOW} has no \`${GATE}\` job`]
  }
  return [...gateNeedsErrors(jobs, gate), ...gateStepErrors(workflow, gate)]
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const errors = forkPrGateErrors(readFileSync(WORKFLOW, 'utf8'))
  if (errors.length > 0) {
    console.error(errors.join('\n'))
    process.exit(1)
  }
  console.log(`fork-pr-gate OK — ${GATE} requires every other job in ${WORKFLOW} to succeed`)
}
