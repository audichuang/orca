#!/usr/bin/env node
// Fork-only PreToolUse hook: on a Mac that sends heavy checks to the ubuntu host, stop an agent that runs
// typecheck, lint gates, fork-check targets, wide vitest runs or scans locally, and point at fork-remote.sh.
// Contract: a reminder for agents following FORK.md and the skills, not a security boundary. It blocks the
// spellings those documents use and never a command they allow; when unsure it lets the command through,
// because a wrong block stalls an unattended pipeline while a miss only costs CPU.
// Active only where ~/.config/orca-fork/heavy-checks-remote exists (the macmini), so other Macs are untouched.
// A command prefixed with FORK_LOCAL_HEAVY=1 passes: the documented fallback after fork-remote.sh exits 90 or 91.
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const PNPM_HEAVY_SCRIPTS =
  /^(tc(:.*)?|typecheck(:.*)?|lint|test(:.*)?|check:changed|check:code-quality:changed)$/
const HEAVY_NODE_SCRIPTS = ['fork-hunk-guard-scan.mjs', 'fork-upstream-red.mjs', 'run-vitest.mjs']
const WRAPPERS = new Set(['env', 'time', 'nohup', 'command', 'exec', 'nice'])
const TEST_FILE = /^[\w./@-]+\.(test|spec)\.[cm]?[jt]sx?$/
// Options that take the next word as their value.
const VITEST_VALUE_OPTIONS = new Set([
  '--config',
  '-c',
  '--project',
  '--reporter',
  '--shard',
  '--outputFile',
  '--root',
  '-r',
  '-t',
  '--testNamePattern',
  '--maxWorkers',
  '--pool'
])
const MAKE_VALUE_OPTIONS = new Set([
  '-C',
  '-f',
  '-I',
  '-o',
  '-W',
  '-j',
  '-l',
  '--directory',
  '--file',
  '--makefile'
])
const PNPM_VALUE_OPTIONS = new Set(['-C', '--dir', '-F', '--filter', '--reporter', '--loglevel'])
const OPERATOR = /^(&&|\|\||\||;|&|\(|\)|\{|\}|\$\(|`|\n)$/
const REDIRECT = /^(\d*(>>?|<|>&|<&)|&>>?)(.*)$/

function dropHeredocBodies(command) {
  const kept = []
  let heredocEnd = null
  for (const line of command.split('\n')) {
    if (heredocEnd !== null) {
      if (line.trim() === heredocEnd) {
        heredocEnd = null
      }
      continue
    }
    kept.push(line)
    const heredoc = /<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/.exec(line)
    if (heredoc) {
      heredocEnd = heredoc[2]
    }
  }
  return kept.join('\n')
}

// Shell words with quotes removed but their content kept, and operators as their own tokens.
function tokenize(command) {
  const tokens = []
  let word = null
  const flush = () => {
    if (word !== null) {
      tokens.push(word)
      word = null
    }
  }
  const text = dropHeredocBodies(command)
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === "'") {
      const end = text.indexOf("'", i + 1)
      word = (word ?? '') + text.slice(i + 1, end === -1 ? text.length : end)
      i = end === -1 ? text.length : end
    } else if (c === '"') {
      let j = i + 1
      let value = ''
      while (j < text.length && text[j] !== '"') {
        value += text[j] === '\\' && j + 1 < text.length ? text[++j] : text[j]
        j++
      }
      word = (word ?? '') + value
      i = j
    } else if (c === '\\' && i + 1 < text.length) {
      word = (word ?? '') + text[++i]
    } else if (c === ' ' || c === '\t') {
      flush()
    } else if (c === '\n' || c === ';' || c === '(' || c === ')' || c === '`') {
      flush()
      tokens.push(c)
    } else if (c === '&' || c === '|') {
      if (c === '&' && (text[i + 1] === '>' || (word !== null && /\d?>$/.test(word)))) {
        word = (word ?? '') + c
        continue
      }
      flush()
      const double = text[i + 1] === c
      tokens.push(double ? c + c : c)
      i += double ? 1 : 0
    } else if (c === '$' && text[i + 1] === '(') {
      flush()
      tokens.push('$(')
      i++
    } else {
      word = (word ?? '') + c
    }
  }
  flush()
  return tokens
}

export function commandsOf(command) {
  const commands = [[]]
  const tokens = tokenize(command)
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (OPERATOR.test(token)) {
      commands.push([])
      continue
    }
    const redirect = REDIRECT.exec(token)
    if (redirect) {
      // `> file` takes the next word as its target; `>file` and `2>&1` carry it.
      if (redirect[3] === '') {
        i++
      }
      continue
    }
    commands.at(-1).push(token)
  }
  return commands.filter((words) => words.length > 0)
}

function selectsOneTestFile(args) {
  let files = 0
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === 'run' && i === 0) {
      continue
    }
    if (VITEST_VALUE_OPTIONS.has(arg)) {
      i++
      continue
    }
    if (arg.startsWith('-')) {
      continue
    }
    // Only a named test file counts as one; a directory, glob, filter or variable may select any number.
    files += TEST_FILE.test(arg) ? 1 : 2
  }
  return files === 1
}

function withoutOptions(args, valueOptions) {
  const rest = []
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (valueOptions.has(arg)) {
      i++
    } else if (!arg.startsWith('-')) {
      rest.push(arg)
    }
  }
  return rest
}

export function heavyReason(words) {
  const env = new Map()
  let i = 0
  const readAssignments = () => {
    while (i < words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i])) {
      const [name, ...value] = words[i].split('=')
      env.set(name, value.join('='))
      i++
    }
  }
  readAssignments()
  while (i < words.length && WRAPPERS.has(words[i])) {
    i++
    readAssignments()
  }
  if (env.get('FORK_LOCAL_HEAVY') === '1') {
    return null
  }
  const [cmd, ...args] = words.slice(i)
  if (!cmd) {
    return null
  }
  const vitestReason = (vitestArgs) =>
    selectsOneTestFile(vitestArgs) ? null : 'vitest on more or less than one test file'
  if (cmd === 'pnpm' || cmd === 'npm' || cmd === 'yarn') {
    const firstWord = args.findIndex(
      (arg, k) => !arg.startsWith('-') && !PNPM_VALUE_OPTIONS.has(args[k - 1])
    )
    if (firstWord === -1) {
      return null
    }
    let rest = args.slice(firstWord)
    if (rest[0] === 'run') {
      rest = rest.slice(1)
    }
    if (rest[0] === 'exec' && rest[1] === 'vitest') {
      return vitestReason(rest.slice(2))
    }
    if (rest[0] === 'test') {
      return vitestReason(rest.slice(1))
    }
    return rest[0] && PNPM_HEAVY_SCRIPTS.test(rest[0]) ? `${cmd} ${rest[0]}` : null
  }
  if (cmd === 'npx' && args[0] === 'vitest') {
    return vitestReason(args.slice(1))
  }
  if (cmd === 'vitest' || cmd.endsWith('/vitest')) {
    return vitestReason(args)
  }
  if (cmd === 'make') {
    if (args.some((arg) => arg === '-n' || arg === '--dry-run' || arg === '--just-print')) {
      return null
    }
    const targets = withoutOptions(args, MAKE_VALUE_OPTIONS).filter((arg) => !arg.includes('='))
    const heavy = targets.find(
      (target) =>
        target.startsWith('fork-check') ||
        target === 'typecheck' ||
        (target === 'fork-canary' && env.get('CANARY_MERGE_ONLY') !== '1')
    )
    return heavy ? `make ${heavy}` : null
  }
  if (cmd === 'node' || cmd === 'tsx') {
    const name = args
      .find((arg) => !arg.startsWith('-'))
      ?.split('/')
      .pop()
    if (name && HEAVY_NODE_SCRIPTS.includes(name) && !args.includes('--report')) {
      return `node ${name}`
    }
  }
  return null
}

export function findHeavyCommands(command) {
  return commandsOf(command)
    .map(heavyReason)
    .filter((reason) => reason !== null)
}

function main() {
  if (
    process.platform !== 'darwin' ||
    !existsSync(join(homedir(), '.config/orca-fork/heavy-checks-remote'))
  ) {
    return
  }
  let command = ''
  try {
    command = JSON.parse(readFileSync(0, 'utf8'))?.tool_input?.command ?? ''
  } catch {
    return
  }
  const found = findHeavyCommands(command)
  if (found.length === 0) {
    return
  }
  process.stderr.write(
    `This Mac sends heavy checks to the ubuntu host (${[...new Set(found)].join(', ')}). ` +
      `Run it as: bash config/scripts/fork-remote.sh '<command>' (or orca-remote '<command>'). ` +
      `Only after it exits 90 (or 91 twice), rerun locally with FORK_LOCAL_HEAVY=1 in front. See FORK.md, Merge gate.\n`
  )
  process.exit(2)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
