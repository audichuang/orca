// Fork-only: runs fork-check-static's upstream checks, the config/scripts tests that read workflows, and the
// cross-version wire journeys on a clean upstream release so the auto-rebase knows, before its own gate, which failures
// are upstream's. Report only: it exempts nothing and exits 0 whatever it finds.
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { runProcessSync } from '@orca/process-host'
import { EXCLUDED } from './fork-lint-run.mjs'
import { wireTests } from './fork-wire-tests.mjs'

const OUTPUT_TAIL_LINES = 60
const MAX_FIX_CANDIDATES = 10

const WORKFLOW_READERS = '\\.github/(workflows|actions)/'

function vitestArgs(report, files) {
  return [
    'exec',
    'vitest',
    'run',
    '--config',
    'config/vitest.config.ts',
    '--reporter=default',
    '--reporter=json',
    `--outputFile.json=${report}`,
    ...files
  ]
}

function listLines(root, args) {
  const result = runProcessSync({ program: 'git', args: ['-C', root, ...args], timeoutMs: null })
  return { code: result.code, lines: result.stdout.split('\n').filter(Boolean) }
}

// Why a glob pathspec: upstream moves tests between config/scripts subdirectories (#38130).
function planWorkflowTests({ root, out }) {
  const { code, lines: files } = listLines(root, [
    'grep',
    '-l',
    '-E',
    WORKFLOW_READERS,
    '--',
    ':(glob)config/scripts/**/*.test.mjs',
    ':(glob)config/scripts/**/*.test.ts'
  ])
  if (code !== 0 || files.length === 0) {
    return {
      error: `no config/scripts test reads .github/workflows or actions (git grep exit ${code})`
    }
  }
  const report = `${out}.workflow-tests.vitest.json`
  return { commands: [{ program: 'pnpm', args: vitestArgs(report, files) }], report }
}

// Why ls-files: #38130 moved ensure-native-runtime.mjs into a subdirectory, so its path changes per release.
function planCrossVersionWire({ root, out }) {
  const { lines: scripts } = listLines(root, [
    'ls-files',
    ':(glob)config/scripts/**/ensure-native-runtime.mjs'
  ])
  if (scripts.length !== 1) {
    return {
      error: `expected exactly one ensure-native-runtime.mjs, found ${scripts.length}: ${scripts.join(', ')}`
    }
  }
  const files = wireTests(root)
  if (files.length === 0) {
    return { error: 'no cross-version wire test found' }
  }
  const report = `${out}.cross-version-wire.vitest.json`
  return {
    commands: [
      { program: 'node', args: [scripts[0], '--runtime=node'] },
      { program: 'pnpm', args: vitestArgs(report, files) }
    ],
    report
  }
}

// Why: wire journeys time out on a busy machine, and whoever reads the report needs to know how busy it was.
function loadNote() {
  return `load ${os.loadavg()[0].toFixed(1)} on ${os.cpus().length} cores`
}

// fork-check-static minus fork-check-quality, which only measures the fork's own diff.
export const UPSTREAM_CHECKS = [
  { name: 'tc', program: 'pnpm', args: ['tc'] },
  { name: 'lint', program: 'pnpm', args: ['run', 'lint'] },
  {
    name: 'check:daemon-protocol-crossing',
    program: 'pnpm',
    args: ['run', 'check:daemon-protocol-crossing']
  },
  { name: 'workflow-tests', plan: planWorkflowTests },
  { name: 'cross-version-wire', plan: planCrossVersionWire, note: loadNote }
]

function tail(output) {
  const lines = output.trimEnd().split('\n')
  const dropped = lines.length - OUTPUT_TAIL_LINES
  return dropped > 0
    ? [`… ${dropped} earlier lines are in the .json`, ...lines.slice(-OUTPUT_TAIL_LINES)].join('\n')
    : lines.join('\n')
}

// run-lint.mjs prints `✗ <step> (<secs>)` above each failing step's output, then `✗ N of M lint step(s) failed in <secs>: a, b`.
// Returns null when that summary is missing, so a changed format reads as unparsed instead of as green.
export function parseRunLintFailures(output) {
  const summary = output.match(/^✗ \d+ of \d+ lint step\(s\) failed in [^:]*: (.+)$/m)
  if (!summary) {
    return null
  }
  const lines = output.split(/\r?\n/)
  return summary[1]
    .split(', ')
    .map((step) => step.trim())
    .map((step) => {
      const start = lines.findIndex((line) => line.startsWith(`✗ ${step} (`))
      if (start === -1) {
        return { step, output: '' }
      }
      const end = lines.findIndex((line, index) => index > start && line.startsWith('✗ '))
      return {
        step,
        output: lines
          .slice(start + 1, end === -1 ? undefined : end)
          .join('\n')
          .trim()
      }
    })
}

// One failure per failing test file of a vitest JSON report; null when the report is unreadable.
export function parseVitestFailures(report, root) {
  let parsed
  try {
    parsed = JSON.parse(report)
  } catch {
    return null
  }
  if (!Array.isArray(parsed?.testResults)) {
    return null
  }
  const prefix = `${root.replace(/\/$/, '')}/`
  return parsed.testResults
    .map((file) => ({
      file,
      failed: file.assertionResults.filter((test) => test.status === 'failed')
    }))
    .filter(({ file, failed }) => file.status === 'failed' || failed.length > 0)
    .map(({ file, failed }) => {
      const name = file.name.startsWith(prefix) ? file.name.slice(prefix.length) : file.name
      const details =
        failed.length === 0
          ? [(file.message || 'suite failed').trim()]
          : failed.map(
              (test) => `${test.fullName}\n${(test.failureMessages?.[0] ?? '').split('\n\n')[0]}`
            )
      return { step: name, file: name, output: details.join('\n\n').trim() }
    })
}

// vitest is { root, report }: report is the JSON a vitest check wrote, undefined when it wrote none.
export function checkFailures(check, result, vitest) {
  if (result.code === 0) {
    return []
  }
  const output = `${result.stdout}${result.stderr}`
  if (vitest?.report !== undefined) {
    const files = parseVitestFailures(vitest.report, vitest.root)
    if (files && files.length > 0) {
      return files.map((failure) => ({
        ...failure,
        step: `${check.name}: ${failure.step}`,
        forkSkips: false
      }))
    }
  }
  if (check.name === 'lint') {
    const steps = parseRunLintFailures(output)
    if (steps) {
      return steps.map((failure) => ({ ...failure, forkSkips: Boolean(EXCLUDED[failure.step]) }))
    }
  }
  return [{ step: check.name, output: output.trim(), forkSkips: false }]
}

// Repo-relative paths a failure names, relative or under root, that exist in the checkout.
// Skips pnpm's `$ <script>` echo and runner exit lines, which name the tooling rather than the failure.
export function mentionedFiles(output, root, exists = existsSync) {
  const prefix = `${root.replace(/\/$/, '')}/`
  const found = new Set()
  const findings = output
    .split(/\r?\n/)
    .filter((line) => !line.startsWith('$ ') && !/exited with code \d+$/.test(line))
    .join('\n')
  for (const match of findings.matchAll(/[\w@.~/-]+\.[A-Za-z]{1,5}\b/g)) {
    const candidate = match[0].startsWith(prefix) ? match[0].slice(prefix.length) : match[0]
    if (
      !candidate.startsWith('/') &&
      !candidate.startsWith('..') &&
      exists(path.join(root, candidate))
    ) {
      found.add(candidate)
    }
  }
  return [...found]
}

function git(root, args) {
  const result = runProcessSync({ program: 'git', args: ['-C', root, ...args], timeoutMs: null })
  if (result.code !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr.trim()}`)
  }
  return result.stdout.trim()
}

function fixCandidates(root, sha, upstreamMain, files) {
  if (files.length === 0) {
    return []
  }
  // Why null: an unfetched upstream main must not read as "upstream has no fix".
  const result = runProcessSync({
    program: 'git',
    // Oldest first: the first upstream commit after the tag is the likeliest fix.
    args: [
      '-C',
      root,
      'log',
      '--reverse',
      '--format=%h %s',
      `${sha}..${upstreamMain}`,
      '--',
      ...files
    ],
    timeoutMs: null
  })
  if (result.code !== 0) {
    return null
  }
  const log = result.stdout.trim()
  const commits = log ? log.split('\n') : []
  return commits.length > MAX_FIX_CANDIDATES
    ? [...commits.slice(0, MAX_FIX_CANDIDATES), `… ${commits.length - MAX_FIX_CANDIDATES} more`]
    : commits
}

export function renderReport({ ref, sha, upstreamMain, results }) {
  const red = results.flatMap((result) => result.failures)
  const lines = [
    `# Upstream ${ref} (${sha.slice(0, 10)}): static checks on the clean release`,
    '',
    ...results.map(({ name, note, failures }) => {
      const suffix = note ? ` [${note}]` : ''
      return failures.length === 0
        ? `- ${name}: green${suffix}`
        : `- ${name}: red${suffix} (${failures.map(({ step }) => step).join(', ')})`
    })
  ]
  if (red.length === 0) {
    lines.push('', "Every red step in the fork gate is the fork's to fix.")
  }
  for (const failure of red) {
    lines.push(
      '',
      `## ${failure.step}${failure.forkSkips ? ' (fork-check-lint skips it: EXCLUDED)' : ''}`
    )
    lines.push('', '```', tail(failure.output) || '(no output captured)', '```')
    if (failure.candidates === null) {
      lines.push(
        '',
        `Could not read ${upstreamMain}; fetch it and search \`${ref}..${upstreamMain}\` by hand.`
      )
      continue
    }
    lines.push(
      '',
      failure.candidates.length === 0
        ? `No ${upstreamMain} commit after ${ref} touches the files it names.`
        : `${upstreamMain} commits after ${ref} touching the files it names (cherry-pick candidates):`
    )
    lines.push(...failure.candidates.map((candidate) => `- ${candidate}`))
  }
  return `${lines.join('\n')}\n`
}

// Runs a check's commands in order, stopping at the first non-zero exit, and collects what it printed.
function runCheck(check, root, out) {
  const plan = check.plan
    ? check.plan({ root, out })
    : { commands: [{ program: check.program, args: check.args }] }
  if (plan.error) {
    return { result: { code: 1, stdout: '', stderr: plan.error } }
  }
  if (plan.report) {
    rmSync(plan.report, { force: true })
  }
  let result = { code: 0, stdout: '', stderr: '' }
  for (const command of plan.commands) {
    console.log(`>> ${command.program} ${command.args.join(' ')}`)
    const step = runProcessSync({
      ...command,
      cwd: root,
      env: { ...process.env, LC_ALL: 'C' },
      timeoutMs: null,
      maxOutputBytes: 64 * 1024 * 1024
    })
    result = {
      code: step.code,
      stdout: result.stdout + step.stdout,
      stderr: result.stderr + step.stderr
    }
    if (step.code !== 0) {
      break
    }
  }
  const report =
    plan.report && existsSync(plan.report) ? readFileSync(plan.report, 'utf8') : undefined
  return { result, vitest: plan.report ? { root, report } : undefined }
}

function main([ref, dir, out, upstreamMain = 'origin/main']) {
  if (!ref || !dir || !out) {
    console.error(
      'usage: fork-upstream-red.mjs <upstream-tag> <worktree-dir> <out-prefix> [upstream-main-ref]'
    )
    return 64
  }
  const sha = git('.', ['rev-parse', `${ref}^{commit}`])
  if (!existsSync(dir)) {
    git('.', ['worktree', 'add', '--detach', dir, sha])
  } else if (git(dir, ['rev-parse', 'HEAD']) !== sha) {
    throw new Error(`${dir} is not at ${ref} (${sha}); remove it or pass another directory`)
  }
  const root = path.resolve(dir)
  const install = runProcessSync({
    program: 'pnpm',
    args: ['install', '--frozen-lockfile'],
    cwd: root,
    // Why HUSKY=0: husky's prepare writes core.hooksPath into the git config every worktree shares.
    env: { ...process.env, HUSKY: '0' },
    stdio: 'inherit',
    timeoutMs: null
  })
  if (install.code !== 0) {
    throw new Error(`pnpm install in ${root} failed with exit code ${install.code}`)
  }
  const results = UPSTREAM_CHECKS.map((check) => {
    const note = check.note?.()
    const { result, vitest } = runCheck(check, root, out)
    const failures = checkFailures(check, result, vitest).map((failure) => ({
      ...failure,
      candidates: fixCandidates(root, sha, upstreamMain, [
        ...new Set([failure.file, ...mentionedFiles(failure.output, root)].filter(Boolean))
      ])
    }))
    return { name: check.name, note, failures }
  })
  const report = { ref, sha, upstreamMain, results }
  writeFileSync(`${out}.json`, `${JSON.stringify(report, null, 2)}\n`)
  const markdown = renderReport(report)
  writeFileSync(`${out}.md`, markdown)
  console.log(markdown)
  return 0
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    process.exitCode = main(process.argv.slice(2))
  } catch (error) {
    console.error(`fork-upstream-red: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}
