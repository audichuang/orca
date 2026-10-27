// Fork-only: runs fork-check-static's upstream checks on a clean upstream release so the auto-rebase knows, before
// its own gate, which failures are upstream's. Report only: it exempts nothing and exits 0 whatever it finds.
import { existsSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { runProcessSync } from '@orca/process-host'
import { EXCLUDED } from './fork-lint-run.mjs'

const OUTPUT_TAIL_LINES = 60
const MAX_FIX_CANDIDATES = 10

// fork-check-static minus fork-check-quality, which only measures the fork's own diff.
export const UPSTREAM_CHECKS = [
  { name: 'tc', program: 'pnpm', args: ['tc'] },
  { name: 'lint', program: 'pnpm', args: ['run', 'lint'] },
  {
    name: 'check:daemon-protocol-crossing',
    program: 'pnpm',
    args: ['run', 'check:daemon-protocol-crossing']
  }
]

function tail(output) {
  return output.trimEnd().split('\n').slice(-OUTPUT_TAIL_LINES).join('\n')
}

// run-lint.mjs prints `✗ <step> (<secs>)` above each failing step's output, then `✗ N of M lint step(s) failed in <secs>: a, b`.
// Returns null when that summary is missing, so a changed format reads as unparsed instead of as green.
export function parseRunLintFailures(output) {
  const summary = output.match(/^✗ \d+ of \d+ lint step\(s\) failed in [^:]*: (.+)$/m)
  if (!summary) {
    return null
  }
  const lines = output.split('\n')
  return summary[1].split(', ').map((step) => {
    const start = lines.findIndex((line) => line.startsWith(`✗ ${step} (`))
    if (start === -1) {
      return { step, output: '' }
    }
    const end = lines.findIndex((line, index) => index > start && line.startsWith('✗ '))
    return { step, output: tail(lines.slice(start + 1, end === -1 ? undefined : end).join('\n')) }
  })
}

export function checkFailures(check, result) {
  if (result.code === 0) {
    return []
  }
  const output = `${result.stdout}${result.stderr}`
  if (check.name === 'lint') {
    const steps = parseRunLintFailures(output)
    if (steps) {
      return steps.map((failure) => ({ ...failure, forkSkips: Boolean(EXCLUDED[failure.step]) }))
    }
  }
  return [{ step: check.name, output: tail(output), forkSkips: false }]
}

// Repo-relative paths a failure names, relative or under root, that exist in the checkout.
export function mentionedFiles(output, root, exists = existsSync) {
  const prefix = `${root.replace(/\/$/, '')}/`
  const found = new Set()
  for (const match of output.matchAll(/[\w@.~/-]+\.[A-Za-z]{1,5}\b/g)) {
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
    args: ['-C', root, 'log', '--format=%h %s', `${sha}..${upstreamMain}`, '--', ...files],
    timeoutMs: null
  })
  if (result.code !== 0) {
    return null
  }
  const log = result.stdout.trim()
  return log ? log.split('\n').slice(0, MAX_FIX_CANDIDATES) : []
}

export function renderReport({ ref, sha, upstreamMain, results }) {
  const red = results.flatMap((result) => result.failures)
  const lines = [
    `# Upstream ${ref} (${sha.slice(0, 10)}): static checks on the clean release`,
    '',
    ...results.map(({ name, failures }) =>
      failures.length === 0
        ? `- ${name}: green`
        : `- ${name}: red (${failures.map(({ step }) => step).join(', ')})`
    )
  ]
  if (red.length === 0) {
    lines.push('', "Every red step in the fork gate is the fork's to fix.")
  }
  for (const failure of red) {
    lines.push(
      '',
      `## ${failure.step}${failure.forkSkips ? ' (fork-check-lint skips it: EXCLUDED)' : ''}`
    )
    lines.push('', '```', failure.output || '(no output captured)', '```')
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
    stdio: 'inherit',
    timeoutMs: null
  })
  if (install.code !== 0) {
    throw new Error(`pnpm install in ${root} failed with exit code ${install.code}`)
  }
  const results = UPSTREAM_CHECKS.map((check) => {
    console.log(`>> ${check.program} ${check.args.join(' ')}`)
    const result = runProcessSync({
      program: check.program,
      args: check.args,
      cwd: root,
      env: { ...process.env, LC_ALL: 'C' },
      timeoutMs: null,
      maxOutputBytes: 64 * 1024 * 1024
    })
    const failures = checkFailures(check, result).map((failure) => ({
      ...failure,
      candidates: fixCandidates(root, sha, upstreamMain, mentionedFiles(failure.output, root))
    }))
    return { name: check.name, failures }
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
