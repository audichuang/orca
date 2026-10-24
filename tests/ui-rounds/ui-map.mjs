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
  openAllCommitChanges: 'Open all changes',
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
  // A path (an editor tab's "/Users/… (diff) 0" button) is not a repo row
  anyRepoRow: /^按鈕 (?!\/)[\w./-]+ \([^)]*\) \d+$/,
  // Repos without changes sit in their own group, collapsed by default
  repoGroupHeader: /^按鈕 NO CHANGES \d+$/,
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
  // A single-repo workspace's panel has no name line there
  const t = i > 1 ? lines[i - 2][1] : ''
  return t.startsWith('文字 ') ? t.slice(3) : null
}

/** The folder workspace whose Source Control is showing: the name heading the row of Open Git Graph … Refresh all. */
export function folderPanelName(lines) {
  const refresh = lines.findIndex(([, t]) => t === `按鈕 ${UI_TEXT.refreshAll}`)
  const graph = lines.findLastIndex(
    ([, t], i) => i < refresh && i > refresh - 8 && t === `按鈕 ${UI_TEXT.openGitGraph}`
  )
  const t = graph > 0 ? lines[graph - 1][1] : ''
  return t.startsWith('文字 ') ? t.slice(3) : null
}

/** "WebApp (main)": the open repo's name and the branch its panel shows ("Current branch: main"). */
export function openRepoTitle(lines) {
  const name = openRepoName(lines)
  const from = detailStartIndex(lines)
  const b = lines.find(([, t], i) => i >= from && t.startsWith('container Current branch: '))
  return name && b ? `${name} (${b[1].replace(/^container Current branch: /, '')})` : name
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

const NOTE_TITLE =
  /Git file\(s\)|No Git changes|Nothing to copy|could not be read|Over \d|Created \d|failed|No Snipcode|Clipboard is empty|not included/

/**
 * The toasts on screen as one line each, in the form stats.py prints: "<title>. 181 chars · 16 lines · 24 words · ~28 tokens."
 * A toast shows the same numbers on separate lines, tokens first; extra lines (skipped files) follow.
 * Several toasts (an info note beside the copy result) join with " / ".
 */
export function toastNote(lines) {
  // Toasts live under the Notifications region; panel hints use the same words.
  const from = lines.findIndex(([, t]) => /^container Notifications\b/.test(t))
  const notes = []
  let end = from
  lines.forEach(([, t], at) => {
    if (at > end && isText(t) && NOTE_TITLE.test(t)) {
      const toast = oneToast(lines, at)
      notes.push(toast.text)
      end = toast.end
    }
  })
  return notes.length ? notes.join(' / ') : null
}

const isText = (t) => /^(文字|text) /.test(t)

function oneToast(lines, at) {
  const title = lines[at][1].replace(/^(文字|text) /, '')
  const rest = []
  let end = at
  for (const [, t] of lines.slice(at + 1)) {
    if (!isText(t)) {
      break
    }
    rest.push(t.replace(/^(文字|text) /, '').trim())
    end++
  }
  // Stats lines hold only counts and separators; anything else (skipped files, a token warning) is extra
  const isStats = (t) => /^[·\s]*$|^(~?[\d,]+ (tokens|lines|chars|words)[·\s]*)+$/.test(t)
  const joined = rest.filter(isStats).join(' ')
  const num = (re) => re.exec(joined)?.[1]
  const tokens = num(/~([\d,]+) tokens/)
  const stats = tokens
    ? ` ${num(/([\d,]+) chars/)} chars · ${num(/([\d,]+) lines/)} lines · ${num(/([\d,]+) words/)} words · ~${tokens} tokens.`
    : ''
  let extra = rest
    .filter((t) => !isStats(t))
    .join(' ')
    .trim()
  // The skipped-files note sat inside the title before 10-21: "13 Git file(s) copied (1 skipped: binary)."
  const skipped = /^\(\d+ skipped[^)]*\)/.exec(extra)
  const head = skipped ? `${title.replace(/\.$/, '')} ${skipped[0]}` : title
  extra = skipped ? extra.slice(skipped[0].length).trim() : extra
  return { text: `${head}${stats ? `.${stats}` : ''}${extra ? ` ${extra}` : ''}`, end }
}
