// Fork-only: after a rebase or canary merge onto an upstream that moved modules, point the fork's module
// specifiers (imports, vi.mock/importActual/import() strings, '@/' and '/src/' aliases) at the new locations.
// Usage: node config/scripts/fork-follow-upstream-moves.mjs <vOLD> <vNEW> <OLD_DEVELOP> [--dry]
//   vOLD: the upstream base OLD_DEVELOP sits on; vNEW: the upstream the tree now sits on (a tag or main);
//   OLD_DEVELOP: the fork tree before the move, used to resolve each specifier where it used to point.
// Run from the checkout root on the rebased (or merged) working tree. Exit 0: nothing left to do;
// 1: a target upstream deleted or split (a removed barrel) needs a hand edit, listed as GONE; 2: usage.
// UNRESOLVED lines already failed to resolve on OLD_DEVELOP (fixtures, dead mocks): listed, not fixed.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { posix } from 'node:path'
import { pathToFileURL } from 'node:url'

const EXTENSIONS = [
  '',
  '.ts',
  '.tsx',
  '.js',
  '.mjs',
  '.cjs',
  '.json',
  '.d.ts',
  '/index.ts',
  '/index.tsx',
  '/index.js'
]
const SOURCE_FILE = /\.(?:[cm]?[jt]sx?|mts)$/
const SPECIFIER = /(['"])((?:\.\.?\/|\/src\/|@\/)[^'"\s]*)\1/g
const RENDERER_ALIAS_ROOT = 'src/renderer/src/'

function targetOf(spec, importer) {
  if (spec.startsWith('@/')) {
    return { path: RENDERER_ALIAS_ROOT + spec.slice(2), style: 'alias' }
  }
  if (spec.startsWith('/src/')) {
    return { path: spec.slice(1), style: 'root' }
  }
  return { path: posix.normalize(posix.join(posix.dirname(importer), spec)), style: 'relative' }
}

function resolveIn(base, isFile) {
  for (const extension of EXTENSIONS) {
    if (isFile(base + extension)) {
      return { file: base + extension, extension }
    }
  }
  return null
}

function specifierFor(target, extension, importer, style) {
  const bare = extension && target.endsWith(extension) ? target.slice(0, -extension.length) : target
  if (style === 'alias' && bare.startsWith(RENDERER_ALIAS_ROOT)) {
    return `@/${bare.slice(RENDERER_ALIAS_ROOT.length)}`
  }
  if (style === 'root') {
    return `/${bare}`
  }
  const relative = posix.relative(posix.dirname(importer), bare)
  return relative.startsWith('.') ? relative : `./${relative}`
}

/**
 * Rewrites the specifiers in `text` (the file now at `newPath`, formerly `oldPath`) that no longer resolve.
 * `isNewFile`/`isOldFile` answer for the current tree and OLD_DEVELOP; `renames` maps old upstream paths to new.
 */
export function rewriteSpecifiers({ text, newPath, oldPath, renames, isNewFile, isOldFile }) {
  const fixes = []
  const unresolved = []
  const gone = []
  const rewritten = text.replace(SPECIFIER, (whole, quote, spec) => {
    if (resolveIn(targetOf(spec, newPath).path, isNewFile)) {
      return whole
    }
    const old = targetOf(spec, oldPath)
    const hit = resolveIn(old.path, isOldFile)
    if (!hit) {
      unresolved.push(spec)
      return whole
    }
    const moved = renames.get(hit.file) ?? hit.file
    if (!isNewFile(moved)) {
      gone.push({ spec, target: moved })
      return whole
    }
    const next = specifierFor(moved, hit.extension, newPath, old.style)
    fixes.push({ from: spec, to: next })
    return quote + next + quote
  })
  return { text: rewritten, fixes, unresolved, gone }
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
}

function renameMap(from, to) {
  const renames = new Map()
  for (const line of git('diff', '-M', '--name-status', from, to).split('\n')) {
    const [status, oldPath, newPath] = line.split('\t')
    if (status?.startsWith('R')) {
      renames.set(oldPath, newPath)
    }
  }
  return renames
}

function main(argv) {
  const dry = argv.includes('--dry')
  const [vOld, vNew, oldDevelop] = argv.filter((arg) => arg !== '--dry')
  if (!oldDevelop) {
    console.error('usage: fork-follow-upstream-moves.mjs <vOLD> <vNEW> <OLD_DEVELOP> [--dry]')
    return 2
  }
  const renames = renameMap(vOld, vNew)
  const oldFiles = new Set(git('ls-tree', '-r', '--name-only', oldDevelop).split('\n'))
  const isNewFile = (path) => existsSync(path) && statSync(path).isFile()
  const isOldFile = (path) => oldFiles.has(path)
  let fixCount = 0
  let goneCount = 0
  for (const line of git('diff', '--name-status', vOld, oldDevelop).split('\n')) {
    const [status, oldPath] = line.split('\t')
    if (!status || !'AM'.includes(status[0])) {
      continue
    }
    const newPath = renames.get(oldPath) ?? oldPath
    if (!SOURCE_FILE.test(newPath) || !isNewFile(newPath)) {
      continue
    }
    const text = readFileSync(newPath, 'utf8')
    const result = rewriteSpecifiers({ text, newPath, oldPath, renames, isNewFile, isOldFile })
    for (const fix of result.fixes) {
      console.log(`FIX\t${newPath}\t${fix.from}\t${fix.to}`)
    }
    for (const spec of result.unresolved) {
      console.log(`UNRESOLVED\t${newPath}\t${spec}`)
    }
    for (const { spec, target } of result.gone) {
      console.log(`GONE\t${newPath}\t${spec}\t${target}`)
    }
    fixCount += result.fixes.length
    goneCount += result.gone.length
    if (!dry && result.text !== text) {
      writeFileSync(newPath, result.text)
    }
  }
  console.error(
    `fork-follow-upstream-moves: ${fixCount} fixed, ${goneCount} gone${dry ? ' (dry run)' : ''}`
  )
  return goneCount ? 1 : 0
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = main(process.argv.slice(2))
}
