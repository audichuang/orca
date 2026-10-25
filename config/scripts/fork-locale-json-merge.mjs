// Fork-only git merge driver for the locale catalogs (node fork-locale-json-merge.mjs %O %A %B, registered by
// fork-merge-driver-install.mjs): both sides add keys at one spot. Exits 0 merged, 2 conflict markers written.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
// Why own keys only: `toString` or `__proto__` are valid catalog keys, not inherited members.
const own = (object, key) => (Object.hasOwn(object, key) ? object[key] : undefined)

// `undefined` stands for a key a side never had or deleted; a key both sides changed takes `pick`'s value.
function mergeValue(base, ours, theirs, pick, conflicts, path) {
  if (isObject(ours) && isObject(theirs)) {
    const baseObject = isObject(base) ? base : {}
    const merged = Object.create(null)
    // Ours first so upstream's key order survives; keys only theirs added follow.
    for (const key of [
      ...Object.keys(ours),
      ...Object.keys(theirs).filter((k) => !Object.hasOwn(ours, k))
    ]) {
      const value = mergeValue(
        own(baseObject, key),
        own(ours, key),
        own(theirs, key),
        pick,
        conflicts,
        `${path}${key}.`
      )
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
  conflicts.push(path.slice(0, -1) || '<root>')
  return { ours, base, theirs }[pick]
}

/** Three-way merge of locale catalogs; `conflicts` lists the keys both sides changed differently. */
export function mergeLocaleJson(base, ours, theirs, { pick = 'ours' } = {}) {
  const conflicts = []
  const merged = mergeValue(base, ours, theirs, pick, conflicts, '')
  return { merged, conflicts }
}

// Same layout as the catalogs upstream writes, so an untouched file stays byte-identical.
const format = (catalog) => `${JSON.stringify(catalog, null, 2)}\n`

function readJson(file) {
  const text = readFileSync(file, 'utf8')
  // Why: an add/add conflict hands the driver an empty base.
  return text.trim() === '' ? {} : JSON.parse(text)
}

// Why 2: the installed command reads any other failure (a crash, unparsable JSON) as "line-merge it with markers".
const CONFLICT_EXIT = 2

function main([basePath, oursPath, theirsPath]) {
  const sides = [basePath, oursPath, theirsPath].map(readJson)
  const { merged, conflicts } = mergeLocaleJson(...sides)
  if (conflicts.length === 0) {
    writeFileSync(oursPath, format(merged))
    return 0
  }
  // Why three full merges: they differ only at the conflicting strings, so git marks just those lines.
  console.error(`fork-locale-json-merge: both sides changed ${conflicts.join(', ')}`)
  const dir = mkdtempSync(join(tmpdir(), 'fork-locale-merge-'))
  try {
    const files = ['ours', 'base', 'theirs'].map((pick) => {
      const file = join(dir, pick)
      writeFileSync(file, format(mergeLocaleJson(...sides, { pick }).merged))
      return file
    })
    const result = spawnSync(
      'git',
      ['merge-file', '-p', '-L', 'ours', '-L', 'base', '-L', 'theirs', ...files],
      {
        encoding: 'utf8',
        maxBuffer: 1 << 28
      }
    )
    if (result.error) {
      throw result.error
    }
    writeFileSync(oursPath, result.stdout)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  return CONFLICT_EXIT
}

// Why realpath: a symlinked path would skip main and exit 0, which git reads as a clean merge of ours alone.
if (process.argv[1] && realpathSync(process.argv[1]) === import.meta.filename) {
  process.exit(main(process.argv.slice(2)))
}
