// Fork-only git merge driver for the locale catalogs: both sides add keys at the same spot, a JSON deep merge keeps both.
// Usage (set up by fork-merge-driver-install.sh): node fork-locale-json-merge.mjs %O %A %B
// Writes the merge into %A and exits 0; on overlapping edits or unparsable JSON it leaves git's conflict markers and exits 1.
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

export class LocaleMergeConflict extends Error {}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

// Why `undefined` means absent: JSON has no undefined, so it can stand for a key one side never had or deleted.
export function mergeLocaleJson(base, ours, theirs, path = '') {
  if (isObject(ours) && isObject(theirs)) {
    const baseObject = isObject(base) ? base : {}
    const merged = {}
    // Ours first so upstream's key order survives; keys only theirs added follow.
    for (const key of [...Object.keys(ours), ...Object.keys(theirs).filter((k) => !(k in ours))]) {
      const value = mergeLocaleJson(baseObject[key], ours[key], theirs[key], `${path}${key}.`)
      if (value !== undefined) {
        merged[key] = value
      }
    }
    return merged
  }
  if (same(ours, theirs)) {
    return ours
  }
  if (same(ours, base)) {
    return theirs
  }
  if (same(theirs, base)) {
    return ours
  }
  throw new LocaleMergeConflict(`both sides changed ${path.slice(0, -1) || '<root>'}`)
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'))
}

function main([basePath, oursPath, theirsPath]) {
  try {
    // Why: an add/add conflict hands the driver an empty base.
    const baseText = readFileSync(basePath, 'utf8')
    const base = baseText.trim() === '' ? {} : JSON.parse(baseText)
    const merged = mergeLocaleJson(base, readJson(oursPath), readJson(theirsPath))
    // Same layout as the catalogs upstream writes, so an untouched file stays byte-identical.
    writeFileSync(oursPath, `${JSON.stringify(merged, null, 2)}\n`)
    return 0
  } catch (error) {
    console.error(`fork-locale-json-merge: ${error.message}; leaving conflict markers`)
    spawnSync(
      'git',
      ['merge-file', '-L', 'ours', '-L', 'base', '-L', 'theirs', oursPath, basePath, theirsPath],
      {
        stdio: 'inherit'
      }
    )
    return 1
  }
}

if (process.argv[1] === import.meta.filename) {
  process.exit(main(process.argv.slice(2)))
}
