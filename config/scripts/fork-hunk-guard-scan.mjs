// Fork mutation pass: revert each fork hunk in an upstream production file to upstream's side, one at a
// time, and run the fork tests that reach that file. A hunk no fork test turns red on is an unguarded seam.
// Usage: node config/scripts/fork-hunk-guard-scan.mjs <fork-base> --out <dir> [--shard i/n] [--only <substr>]
//        node config/scripts/fork-hunk-guard-scan.mjs --report <dir>
import { execFileSync, spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript-api'
import { classifyUpstreamFile } from './fork-footprint.mjs'
import { isTestOnlySourcePath } from './test-only-source-path.mjs'
import { collectUnitDependencyGraph, unitConsumers } from './ci-unit-dependency-graph.mjs'

const UNIT_TEST = /\.test\.[cm]?[jt]sx?$/
const RUN_TIMEOUT_MS = 10 * 60 * 1000
const CRASH =
  /^(?:ReferenceError|SyntaxError)|is not defined|is not a function|Cannot find module|does not provide an export|\(file failed to load\)/

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 28 })
}

/** Splits one file's `git diff` (default context) into hunks with both sides' line numbers. */
export function parseHunks(diffText) {
  const hunks = []
  let hunk
  let oldLine = 0
  let newLine = 0
  for (const line of diffText.split('\n')) {
    const header = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line)
    if (header) {
      oldLine = Number(header[1])
      newLine = Number(header[3])
      hunk = {
        newStart: newLine,
        newCount: header[4] === undefined ? 1 : Number(header[4]),
        oldLines: [],
        added: [],
        removed: []
      }
      hunks.push(hunk)
      continue
    }
    if (!hunk || line.startsWith('\\')) {
      continue
    }
    if (line.startsWith('+')) {
      hunk.added.push({ line: newLine++, text: line.slice(1) })
    } else if (line.startsWith('-')) {
      hunk.removed.push({ line: oldLine++, text: line.slice(1) })
      hunk.oldLines.push(line.slice(1))
    } else if (line.startsWith(' ')) {
      hunk.oldLines.push(line.slice(1))
      oldLine++
      newLine++
    }
  }
  return hunks
}

/** The file with this one hunk put back to the base side. */
export function revertHunk(newText, hunk) {
  const lines = newText.split('\n')
  // Why: a zero-length new side starts after line newStart, not at it.
  const start = hunk.newCount === 0 ? hunk.newStart : hunk.newStart - 1
  lines.splice(start, hunk.newCount, ...hunk.oldLines)
  return lines.join('\n')
}

function importLineSet(sourceText, path) {
  const lines = new Set()
  if (!/\.[cm]?[jt]sx?$/.test(path)) {
    return lines
  }
  const file = ts.createSourceFile(path, sourceText, ts.ScriptTarget.Latest, true)
  for (const statement of file.statements) {
    const isImport =
      ts.isImportDeclaration(statement) ||
      ts.isImportEqualsDeclaration(statement) ||
      (ts.isExportDeclaration(statement) && statement.moduleSpecifier)
    if (!isImport) {
      continue
    }
    const first = file.getLineAndCharacterOfPosition(statement.getStart()).line + 1
    const last = file.getLineAndCharacterOfPosition(statement.getEnd()).line + 1
    for (let line = first; line <= last; line++) {
      lines.add(line)
    }
  }
  return lines
}

const COSMETIC = /^\s*(?:$|\/\/|\/\*|\*)/

/** Only `code` hunks are mutated: imports and comments carry no behaviour of their own. */
export function classifyHunk(hunk, { oldText, newText, path }) {
  const changed = [...hunk.added, ...hunk.removed]
  if (changed.every(({ text }) => COSMETIC.test(text))) {
    return 'cosmetic'
  }
  const newImports = importLineSet(newText, path)
  const oldImports = importLineSet(oldText, path)
  const onlyImports =
    hunk.added.every(({ line, text }) => newImports.has(line) || COSMETIC.test(text)) &&
    hunk.removed.every(({ line, text }) => oldImports.has(line) || COSMETIC.test(text))
  if (onlyImports) {
    return 'import'
  }
  // Why: a hunk that emits the same JavaScript (a type, an optional field) is invisible to tests; `pnpm tc` guards it.
  return emittedJs(newText, path) === emittedJs(revertHunk(newText, hunk), path)
    ? 'type-only'
    : 'code'
}

function emittedJs(text, path) {
  return ts.transpileModule(text, {
    fileName: path,
    compilerOptions: {
      removeComments: true,
      jsx: ts.JsxEmit.Preserve,
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext
    }
  }).outputText
}

/** The fork tests that reach a file through upstream's unit dependency graph, plus those naming it as text. */
function forkTestReach(root, forkTests) {
  const { reverse } = collectUnitDependencyGraph(root)
  const forkTestSet = new Set(forkTests)
  const texts = new Map(forkTests.map((test) => [test, readFileSync(join(root, test), 'utf8')]))
  return {
    testsFor(path) {
      const tests = new Set(
        [...unitConsumers(new Set([path]), reverse)].filter((file) => forkTestSet.has(file))
      )
      const stem = path.replace(/\.[cm]?[jt]sx?$/, '')
      for (const [test, text] of texts) {
        if (text.includes(stem)) {
          tests.add(test)
        }
      }
      return [...tests].sort()
    }
  }
}

function runVitest(root, tests, outFile, { bail = true } = {}) {
  rmSync(outFile, { force: true })
  const result = spawnSync(
    process.execPath,
    [
      join(root, 'node_modules/vitest/vitest.mjs'),
      'run',
      '--config',
      'config/vitest.config.ts',
      '--reporter=json',
      `--outputFile=${outFile}`,
      ...(bail ? ['--bail=1'] : []),
      '--maxWorkers=2',
      '--passWithNoTests',
      ...tests
    ],
    {
      cwd: root,
      encoding: 'utf8',
      timeout: RUN_TIMEOUT_MS,
      env: { ...process.env, LC_ALL: 'C', ORCA_BACKGROUND_LAUNCH: '1' },
      maxBuffer: 1 << 28
    }
  )
  if (!existsSync(outFile)) {
    return { error: (result.stderr || result.stdout || String(result.error)).slice(-600) }
  }
  const report = JSON.parse(readFileSync(outFile, 'utf8'))
  const failed = []
  for (const file of report.testResults ?? []) {
    const failure = (file.assertionResults ?? []).find((test) => test.status === 'failed')
    if (file.status === 'failed') {
      failed.push({
        file: relative(root, file.name),
        test: failure?.fullName ?? '(file failed to load)',
        message: (failure?.failureMessages?.[0] ?? file.message ?? '').split('\n')[0].slice(0, 300)
      })
    }
  }
  return { failed }
}

function shardOf(list, spec) {
  if (!spec) {
    return list
  }
  const [index, count] = spec.split('/').map(Number)
  return list.filter((_, position) => position % count === index - 1)
}

function scan(base, { out, shard, only }) {
  const root = git(['rev-parse', '--show-toplevel']).trim()
  if (git(['status', '--porcelain', '--untracked-files=no']).trim()) {
    throw new Error('tracked changes in the worktree; scan a clean checkout')
  }
  const status = git(['diff', '--name-status', '--no-renames', base, 'HEAD'])
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('\t'))
  const files = shardOf(
    status
      .filter(([code, path]) => code === 'M' && classifyUpstreamFile(path) === 'production')
      .map(([, path]) => path)
      .filter((path) => !only || path.includes(only))
      .sort(),
    shard
  )
  const forkTests = status
    .filter(([code, path]) => code !== 'D' && UNIT_TEST.test(path) && isTestOnlySourcePath(path))
    .map(([, path]) => path)
    .filter((path) => !path.startsWith('tests/e2e/'))
  mkdirSync(out, { recursive: true })
  const tag = shard ? shard.replace('/', 'of') : 'all'
  const outFile = join(out, `hunks-${tag}.jsonl`)
  const vitestJson = join(out, `.vitest-${tag}.json`)
  const reach = forkTestReach(root, forkTests)
  const plan = files.map((path) => ({ path, tests: reach.testsFor(path) }))

  const union = [...new Set(plan.flatMap(({ tests }) => tests))]
  console.log(`${files.length} files, ${union.length} fork tests reach them`)
  const baseline =
    union.length > 0 ? runVitest(root, union, vitestJson, { bail: false }) : { failed: [] }
  if (baseline.error) {
    throw new Error(`baseline run failed to report: ${baseline.error}`)
  }
  // Why: a test already red at HEAD would mark every hunk it reaches as guarded.
  const baselineRed = new Set(baseline.failed.map(({ file }) => file))
  writeFileSync(join(out, `baseline-${tag}.json`), JSON.stringify([...baselineRed], null, 2))

  const restore = new Map()
  const putBack = () => restore.forEach((text, file) => writeFileSync(file, text))
  process.once('SIGINT', () => {
    putBack()
    process.exit(130)
  })
  writeFileSync(outFile, '')
  for (const { path, tests } of plan) {
    const absolute = join(root, path)
    const newText = readFileSync(absolute, 'utf8')
    const oldText = git(['show', `${base}:${path}`])
    const candidates = tests.filter((test) => !baselineRed.has(test))
    const hunks = parseHunks(git(['diff', '--no-renames', base, 'HEAD', '--', path]))
    restore.set(absolute, newText)
    for (const hunk of hunks) {
      const kind = classifyHunk(hunk, { oldText, newText, path })
      const record = {
        file: path,
        line: hunk.added[0]?.line ?? hunk.newStart,
        kind,
        added: hunk.added.length,
        removed: hunk.removed.length,
        preview: [...hunk.removed.map((l) => `-${l.text}`), ...hunk.added.map((l) => `+${l.text}`)]
          .slice(0, 6)
          .join('\n'),
        candidates: candidates.length
      }
      if (kind !== 'code') {
        record.result = 'skipped'
      } else if (candidates.length === 0) {
        record.result = 'no-fork-test'
      } else {
        writeFileSync(absolute, revertHunk(newText, hunk))
        try {
          const run = runVitest(root, candidates, vitestJson)
          if (run.error) {
            record.result = 'error'
            record.detail = run.error
          } else if (run.failed.length > 0) {
            // Why: reverting half a fork change (a declaration another hunk uses) turns tests red without testing it.
            record.result = CRASH.test(run.failed[0].message) ? 'crash-only' : 'guarded'
            record.redBy = run.failed[0]
          } else {
            record.result = 'survived'
            record.ran = candidates
          }
        } finally {
          writeFileSync(absolute, newText)
        }
      }
      writeFileSync(outFile, `${JSON.stringify(record)}\n`, { flag: 'a' })
      console.log(`${record.result.padEnd(12)} ${path}:${record.line} (${kind})`)
    }
    restore.delete(absolute)
  }
  rmSync(vitestJson, { force: true })
}

function report(dir) {
  const records = readdirSync(dir)
    .filter((name) => /^hunks-.*\.jsonl$/.test(name))
    .flatMap((name) =>
      readFileSync(join(dir, name), 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line))
    )
  const count = (result) => records.filter((record) => record.result === result).length
  const section = (title, result, note) => {
    const rows = records
      .filter((record) => record.result === result)
      .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
    const body = rows.map((record) => {
      const extra =
        result === 'survived'
          ? `\n  ran: ${record.ran.join(', ')}`
          : result === 'error'
            ? `\n  ${record.detail.replace(/\n/g, ' ').slice(0, 200)}`
            : result === 'crash-only'
              ? `\n  red by: ${record.redBy.file}: ${record.redBy.message}`
              : ''
      return `- \`${record.file}:${record.line}\` (+${record.added} -${record.removed})${extra}\n\n  \`\`\`diff\n${record.preview
        .split('\n')
        .map((line) => `  ${line}`)
        .join('\n')}\n  \`\`\``
    })
    return [`## ${title} (${rows.length})`, '', note, '', ...body, ''].join('\n')
  }
  const markdown = [
    '# Fork hunk guard scan',
    '',
    `hunks: ${records.length}; guarded ${count('guarded')}, survived ${count('survived')}, no fork test ${count('no-fork-test')}, crash-only ${count('crash-only')}, error ${count('error')}, skipped (import, comment or type only, which pnpm tc guards) ${count('skipped')}`,
    '',
    section(
      'Survived: fork tests reach the file but stay green',
      'survived',
      'A weak test, an equivalent mutant, or behaviour only e2e covers. Triage each.'
    ),
    section('No fork test reaches the file', 'no-fork-test', 'Missing guard unless e2e covers it.'),
    section(
      'Red only by a crash',
      'crash-only',
      'Reverting this hunk alone broke the module (a name another hunk uses); guarded only if that hunk is.'
    ),
    section('Errors', 'error', 'The run did not report; rerun these.')
  ].join('\n')
  writeFileSync(join(dir, 'report.md'), markdown)
  console.log(markdown.split('\n')[2])
}

function main() {
  const args = process.argv.slice(2)
  const flag = (name) => {
    const index = args.indexOf(name)
    return index === -1 ? undefined : args[index + 1]
  }
  if (flag('--report')) {
    report(flag('--report'))
    return
  }
  const base = args.find(
    (arg, index) => !arg.startsWith('--') && !args[index - 1]?.startsWith('--')
  )
  const out = flag('--out')
  if (!base || !out) {
    console.error(
      'usage: fork-hunk-guard-scan.mjs <fork-base> --out <dir> [--shard i/n] [--only <substr>] | --report <dir>'
    )
    process.exit(2)
  }
  scan(base, { out: resolve(out), shard: flag('--shard'), only: flag('--only') })
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main()
}
