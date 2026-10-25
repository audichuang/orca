// Discovery heuristic: catches a new file that switches on editor kinds without the fork case; misses an omission inside an already wired file.
// Fork guard: an upstream site that lists editor tab kinds must handle the fork's Git Graph kind too.
// 'check-details' is upstream's newest virtual editor kind and every site that enumerates editor
// kinds names it, so a file naming it must name 'git-graph' or import a fork editor-kind module.
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC_ROOT = path.resolve(__dirname, '..')
const ANCHOR = "'check-details'"
const FORK_REFERENCE = /'git-graph'|fork-editor-tab-kinds|git-graph-editor-surfaces/

/** Files that name check-details only for its own behavior, where the default path is right for git-graph. */
const ALLOWED = new Map<string, string>([
  [
    'renderer/src/components/editor/closed-editor-tab-disposal.ts',
    'disposes the check-details reading cache; a Git Graph tab has none'
  ],
  [
    'renderer/src/components/editor/closed-editor-tab-controller.ts',
    'feeds closed check-details tabs to that cache disposal'
  ],
  [
    'renderer/src/components/editor/check-details-reading-fixture.ts',
    'test fixture building a check-details open file'
  ],
  [
    'renderer/src/components/editor/check-details-reading-owner.ts',
    'owns the reading cache of one check-details tab'
  ],
  [
    'renderer/src/store/slices/editor/actions/check-run-details-actions.ts',
    'opens and refreshes check-details tabs; git-graph has its own actions'
  ],
  [
    'shared/workspace-layout/old-client/old-client-session-editor-rows.ts',
    "reviewTabRow serves conflict-review and check-details; the projection's switch drops git-graph"
  ]
])

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      return entry.name === 'node_modules' ? [] : sourceFiles(full)
    }
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : []
  })
}

function relative(file: string): string {
  return path.relative(SRC_ROOT, file).split(path.sep).join('/')
}

describe('fork editor tab kinds in upstream editor-kind sites', () => {
  const anchored = sourceFiles(SRC_ROOT)
    .map((file) => ({ file: relative(file), text: readFileSync(file, 'utf8') }))
    .filter(({ text }) => text.includes(ANCHOR))

  it('every file listing check-details handles git-graph or is allowlisted', () => {
    const missing = anchored
      .filter(({ file, text }) => !FORK_REFERENCE.test(text) && !ALLOWED.has(file))
      .map(({ file }) => file)
    expect(missing).toEqual([])
  })

  it('every allowlist entry still names check-details and still lacks git-graph', () => {
    const live = new Map(anchored.map(({ file, text }) => [file, text]))
    const stale = [...ALLOWED.keys()].filter((file) => {
      const text = live.get(file)
      return text === undefined || FORK_REFERENCE.test(text)
    })
    expect(stale).toEqual([])
  })
})
