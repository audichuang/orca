// Fork check: every en key the fork added since the upstream base must exist in all other locales.
// Upstream's catalog checks tolerate untranslated keys, so a rebase that takes upstream's side of a locale file passes them.
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'

const [base] = process.argv.slice(2)
const dir = 'src/renderer/src/i18n/locales'
if (!base) {
  console.error('usage: node config/scripts/fork-locale-parity.mjs <upstream-base-ref>')
  process.exit(2)
}

function flatKeys(tree, prefix = '', out = new Set()) {
  for (const [key, value] of Object.entries(tree)) {
    if (value && typeof value === 'object') {
      flatKeys(value, `${prefix}${key}.`, out)
    } else if (typeof value === 'string' && value.trim() !== '') {
      // Why: an empty value renders a blank label, so it counts as missing.
      out.add(prefix + key)
    }
  }
  return out
}

const read = (file) => JSON.parse(readFileSync(`${dir}/${file}`, 'utf8'))
const baseEn = flatKeys(
  JSON.parse(
    execFileSync('git', ['show', `${base}:${dir}/en.json`], {
      encoding: 'utf8',
      maxBuffer: 1 << 28
    })
  )
)
const forkKeys = [...flatKeys(read('en.json'))].filter((key) => !baseEn.has(key))

let failed = false
for (const file of readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'en.json')) {
  const keys = flatKeys(read(file))
  const missing = forkKeys.filter((key) => !keys.has(key))
  if (missing.length > 0) {
    failed = true
    console.error(
      `${file}: missing ${missing.length} fork key(s), e.g. ${missing.slice(0, 5).join(', ')}`
    )
  }
}
if (failed) {
  console.error('Keep both sides of locale conflicts (FORK.md); fork keys are pure additions.')
  process.exit(1)
}
console.log(`fork locale parity: ${forkKeys.length} fork keys present in every locale`)
