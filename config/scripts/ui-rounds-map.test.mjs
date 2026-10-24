// UI rounds (tests/ui-rounds) find Orca's controls by the text the app shows. When a PR renames a label,
// the rounds break silently until someone runs one; this test fails that PR instead.
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { UI_TEXT } from '../../tests/ui-rounds/ui-map.mjs'

const ROOT = path.resolve(import.meta.dirname, '../..')
const ROUNDS = path.join(ROOT, 'tests/ui-rounds')
const ROLES = '按鈕|彈出式按鈕|核取方塊|圓形按鈕|標題|切換鈕|下拉式方塊|文字欄位|文字項目區域'
// Names the fixture creates (repos, branches, files), not app strings.
const FIXTURE_NAMES = [
  'MultiProduct',
  'api-server',
  'WebApp',
  'WebApp-feature',
  'core',
  'docs-site',
  'notes',
  'feature',
  'main',
  'LaneRepo',
  'pr13'
]
const FIXTURE_WORDS = new RegExp(`^(${FIXTURE_NAMES.join('|')})\\b|\\.\\w+$`)

function walk(dir, keep) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      return e.name === 'node_modules' ? [] : walk(p, keep)
    }
    return keep(p) ? [p] : []
  })
}

/** The fixed text at the start of each `^<role> …` pattern in the rounds' scripts. */
function labelsInScripts() {
  const files = walk(ROUNDS, (p) => p.endsWith('.mjs'))
  const found = new Map()
  const re = new RegExp(
    `\\^(?:\\((?:${ROLES})\\|?[^)]*\\)|${ROLES}) ((?:[A-Za-z&'][\\w&'’]*(?: |\\\\ )?)+)`,
    'g'
  )
  for (const file of files) {
    for (const m of readFileSync(file, 'utf8').matchAll(re)) {
      const label = m[1].replace(/\\ /g, ' ').trim()
      if (label.length >= 4 && !FIXTURE_WORDS.test(label)) {
        found.set(label, path.relative(ROOT, file))
      }
    }
  }
  return found
}

function rendererText() {
  const files = walk(
    path.join(ROOT, 'src/renderer/src'),
    (p) => /\.(tsx?|json)$/.test(p) && !/\.test\./.test(p)
  )
  // Toasts' close button is labelled by sonner, not by our sources.
  files.push(path.join(ROOT, 'node_modules/sonner/dist/index.mjs'))
  return files
    .map((f) => readFileSync(f, 'utf8'))
    .join('\n')
    .toLowerCase()
}

/** Labels may end in a name the app fills in ("Project actions for WebApp"); drop such tails, not lowercase words. */
function presentIn(corpus, label) {
  const words = label
    .replace(/['’]+$/, '')
    .trim()
    .split(' ')
  while (words.length > 1) {
    if (corpus.includes(words.join(' ').toLowerCase())) {
      return true
    }
    const last = words.at(-1)
    if (last === last.toLowerCase() && !FIXTURE_NAMES.includes(last)) {
      return false
    }
    words.pop()
  }
  return corpus.includes(words[0].toLowerCase())
}

describe('UI round scripts', () => {
  const corpus = rendererText()

  it('name only UI text that the renderer still has', () => {
    const missing = [...labelsInScripts()]
      .filter(([label]) => !presentIn(corpus, label))
      .map(([label, file]) => `${file}: "${label}"`)
    expect(missing).toEqual([])
  })

  it('keep every ui-map label in the renderer', () => {
    const missing = Object.entries(UI_TEXT).filter(
      ([, text]) => !corpus.includes(text.toLowerCase())
    )
    expect(missing).toEqual([])
  })
})
