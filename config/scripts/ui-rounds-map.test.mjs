// UI rounds (tests/ui-rounds) find Orca's controls by the text the app shows. When a PR renames a label,
// the rounds break silently until someone runs one; this test fails that PR instead.
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ROLE_ALIASES, UI_TEXT } from '../../tests/ui-rounds/ui-map.mjs'

const ROOT = path.resolve(import.meta.dirname, '../..')
const ROUNDS = path.join(ROOT, 'tests/ui-rounds')
const ROLES = [...new Set(Object.values(ROLE_ALIASES))].join('|')
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
  'pr13',
  'hidden'
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
  // Regex sources (/^按鈕 Close tab$/) and string prefixes (t.startsWith('按鈕 Close tab'))
  const re = new RegExp(
    `(?:\\^|['"\`])(?:\\((?:${ROLES})\\|?[^)]*\\)|${ROLES}) ((?:[A-Za-z&'][\\w&'’]*(?: |\\\\ )?)+)(\\$(?!\\{))?`,
    'g'
  )
  for (const file of files) {
    for (const m of readFileSync(file, 'utf8').matchAll(re)) {
      const label = m[1]
        .replace(/\\ /g, ' ')
        .replace(/['’]+$/, '')
        .trim()
      if (label.length >= 4 && !FIXTURE_WORDS.test(label)) {
        // /^按鈕 Stage$/ needs the whole label; a prefix may continue ("Stage (2)"). Both are checked.
        const exact = Boolean(m[2])
        found.set(`${label}${exact ? '$' : ''}`, { label, file: path.relative(ROOT, file), exact })
      }
    }
  }
  return found
}

function rendererText() {
  const files = walk(
    path.join(ROOT, 'src/renderer/src'),
    // Rounds run in English; other locales keep stale copies of renamed strings
    (p) => /\.(tsx?|json)$/.test(p) && !/\.test\./.test(p) && !/locales\/(?!en\.json)/.test(p)
  )
  // Toasts' close button is labelled by sonner, not by our sources.
  files.push(path.join(ROOT, 'node_modules/sonner/dist/index.mjs'))
  // Comments mention old labels; only code and strings count
  return files
    .map((f) => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\/|(^|[^:])\/\/.*$/gm, '$1'))
    .join('\n')
}

/**
 * The label as a whole string or JSX text ("Stage", >Stage<), not a phrase inside a longer one, so renaming the
 * Stage button fails even though "Stage all" and the action id 'stage' remain. A prefix may run on into a
 * placeholder or a count. Section titles render upper-case from title-case source, so those ignore case.
 */
const hasLabel = (corpus, label, exact = false) =>
  new RegExp(
    `['"\`>]\\s*${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*${exact ? `['"\`<]` : `['"\`<{$(]`}`,
    label === label.toUpperCase() ? 'i' : ''
  ).test(corpus)

/** Labels may end in a name the app fills in ("Project actions for WebApp"); drop such tails, not lowercase words. */
function presentIn(corpus, label, exact) {
  const words = label
    .replace(/['’]+$/, '')
    .trim()
    .split(' ')
  while (words.length > 1) {
    if (hasLabel(corpus, words.join(' '), exact)) {
      return true
    }
    const last = words.at(-1)
    if (last === last.toLowerCase() && !FIXTURE_NAMES.includes(last)) {
      return false
    }
    words.pop()
    // Dropping a filled-in tail leaves a prefix
    exact = false
  }
  return hasLabel(corpus, words[0], exact)
}

describe('UI round scripts', () => {
  const corpus = rendererText()

  it('name only UI text that the renderer still has', () => {
    const missing = [...labelsInScripts().values()]
      .filter(({ label, exact }) => !presentIn(corpus, label, exact))
      .map(({ label, file }) => `${file}: "${label}"`)
    expect(missing).toEqual([])
  })

  it('keep every ui-map label in the renderer', () => {
    // Finders match these whole, except labels the app completes ("Current branch: main")
    const prefixes = new Set(['currentBranch'])
    const missing = Object.entries(UI_TEXT).filter(
      ([key, text]) => !hasLabel(corpus, text, !prefixes.has(key))
    )
    expect(missing).toEqual([])
  })
})
