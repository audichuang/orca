// What cases look for in Orca Dev's accessibility tree, in one place. Cases ask for a repo row, a section
// of the open repo or a file row by meaning; only this file knows how those read in the AX text, so a UI
// change is one edit here instead of a hunt through every case.
// UI_TEXT lists the app strings these finders rely on; config/scripts/ui-rounds-map.test.mjs fails when
// one disappears from the renderer, so a renamed label is caught in CI rather than in a round.

/** macOS prints AX roles in the system language; cases use the Traditional Chinese names. */
export const ROLE_ALIASES = {
  button: '按鈕',
  'pop up button': '彈出式按鈕',
  'check box': '核取方塊',
  checkbox: '核取方塊',
  'radio button': '圓形按鈕',
  heading: '標題',
  'toggle button': '切換鈕',
  switch: '切換',
  'combo box': '下拉式方塊',
  'text field': '文字欄位',
  'text entry area': '文字項目區域',
  'close button': '關閉按鈕'
}

export const UI_TEXT = {
  sourceControlTab: 'Source Control',
  explorerTab: 'Explorer',
  refreshAll: 'Refresh all repositories',
  copyAllChanges: 'Copy all changes',
  pasteRestore: 'Paste & Restore',
  addReposInFolder: 'Add repositories in this folder',
  openGitGraph: 'Open Git Graph',
  detailStart: 'Filter files by name',
  copyFullSource: 'Copy Full Source',
  viewAll: 'View all',
  stage: 'Stage',
  discardChanges: 'Discard changes',
  closeTab: 'Close tab',
  closeToast: 'Close toast',
  openFile: 'Open file',
  settings: 'Settings',
  backToApp: 'Back to app',
  autoSaveFiles: 'Auto Save Files',
  bannerChangedOnDisk: 'changed on disk while you have unsaved edits'
}

/** Sections that no longer exist on their own; v1.4.238 lists untracked files inside CHANGES. */
export const SECTION_ALIASES = { 'UNTRACKED FILES': 'CHANGES' }

/** The section name a case's header regex names (/^按鈕 STAGED CHANGES \d/ → 'STAGED CHANGES'). */
export function sectionNameOf(re) {
  const m = /\^按鈕 ([A-Z][A-Z ]*[A-Z]|Notes)/.exec(re.source)
  if (!m) {
    throw new Error(`not a section header pattern: ${re}`)
  }
  return SECTION_ALIASES[m[1]] ?? m[1]
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')

/** "按鈕 api-server main ↓1 ↑2 2, Help: api-server (main)" → "按鈕 api-server (main) 2"; no count reads 0. */
export function canonicalRepoRow(text) {
  const m = /^按鈕 (.+), Help: ([^\s()]+) \(([^)]*)\)$/.exec(text)
  if (!m) {
    return text
  }
  const n = /(?:^|\s)(\d+)$/.exec(m[1].replace(/\s*[↓↑]\d+/g, ''))
  return `按鈕 ${m[2]} (${m[3]}) ${n ? n[1] : 0}`
}

/** One AX line in the canonical form cases match: Chinese role names, repo rows as "name (branch) N". */
export function canonicalLine(text) {
  const role = Object.keys(ROLE_ALIASES).find((en) => text.startsWith(`${en} `))
  const zh = role ? ROLE_ALIASES[role] + text.slice(role.length) : text
  return canonicalRepoRow(zh)
}

export const RE = {
  repoRow: (name, branch) =>
    new RegExp(`^按鈕 ${esc(name)} \\(${branch ? esc(branch) : '[^)]*'}\\) \\d+$`),
  anyRepoRow: /^按鈕 [\w./-]+ \([^)]*\) \d+$/,
  sectionHeader: (name) => new RegExp(`^按鈕 ${esc(name)} \\d+$`),
  anySectionHeader: /^按鈕 (CHANGES|STAGED CHANGES|COMMITTED ON BRANCH|COMMITS|Notes)( \d+)?$/,
  detailStart: new RegExp(`^按鈕 ${esc(UI_TEXT.detailStart)}$`),
  workspaceRow: (name) => new RegExp(`^(text (Active|Inactive)|container) ${esc(name)}$`),
  button: (name) => new RegExp(`^按鈕 ${esc(name)}$`)
}

/** Index of the open repo's panel in `lines`: the line after its "Filter files by name" button. */
export function detailStartIndex(lines) {
  const i = lines.findIndex(([, t]) => RE.detailStart.test(t))
  return i === -1 ? -1 : i + 1
}

/** The open repo's name: the text line right before "Filter files by name". */
export function openRepoName(lines) {
  const i = detailStartIndex(lines)
  return i > 1 ? lines[i - 2][1].replace(/^文字 /, '') : null
}

/** [start, end) of a section of the open repo; the repo list above has its own CHANGES group. */
export function sectionRange(lines, name) {
  const from = detailStartIndex(lines)
  if (from < 0) {
    return null
  }
  const wanted = SECTION_ALIASES[name] ?? name
  const head = lines.findIndex(([, t], i) => i >= from && RE.sectionHeader(wanted).test(t))
  if (head === -1) {
    return null
  }
  const next = lines.findIndex(([, t], i) => i > head && RE.anySectionHeader.test(t))
  return [head, next === -1 ? lines.length : next]
}

/** Index in `lines` of the first row matching rowRe inside a section of the open repo, or -1. */
export function rowIndexIn(lines, name, rowRe) {
  const r = sectionRange(lines, name)
  if (!r) {
    return -1
  }
  const i = lines.slice(r[0] + 1, r[1]).findIndex(([, t]) => rowRe.test(t))
  return i === -1 ? -1 : r[0] + 1 + i
}
