// V1:v1 測案(P/A/B/C/D/E/F/G/H/I/J)腳本化。測案原文 docs/fork/folder-multi-repo-ui-test-handoff.md,
// 修正以 docs/fork/v2/00-index.md 第 1 節為準。ID 一律加 V1- 前綴。
// diff 內容(Monaco)不在 AX 樹裡,靠點進 editor、Cmd+A/Cmd+C 後讀剪貼簿;讀不到時回傳字串註明「內容未驗證」。
import fs from 'node:fs'

export const HOME_ = ROUND.root
export const V1_ROOT = '// clipcode-root: MultiProduct\n'
// 依名稱排序,比對數字不受清單順序影響(順序由 V1-A1 單獨檢查)
export const v1SortCounts = (m) =>
  Object.fromEntries(Object.entries(m).sort(([a], [b]) => a.localeCompare(b)))
export const V1_EXPECT_COUNTS = v1SortCounts({
  'api-server': 2,
  core: 2,
  'docs-site': 0,
  WebApp: 10,
  'WebApp-feature': 1
})

// ---------- 共用小函式(v1 前綴) ----------
export const v1Start = async () => {
  await openMP()
}

/** repo 清單列:{id,name,branch,n}。 */
export const v1Rows = async () =>
  (await lines())
    .map(([id, t]) => ({ id, m: t.match(/^按鈕 ([\w-]+) \(([^)]+)\) (\d+)$/) }))
    .filter((x) => x.m)
    .map((x) => ({ id: x.id, name: x.m[1], branch: x.m[2], n: Number(x.m[3]) }))

export const v1CountsMap = async () =>
  v1SortCounts(Object.fromEntries((await v1Rows()).map((r) => [r.name, r.n])))

export const v1WaitUntil = async (pred, ms = 10000, step = 500) => {
  const t0 = Date.now()
  for (;;) {
    const v = await pred()
    if (v) {
      return v
    }
    if (Date.now() - t0 > ms) {
      return null
    }
    await sleep(step)
  }
}

/** 下方面板開著的 repo 名稱。 */
export const v1Panel = async () => openRepoTitle()

export const v1Select = async (name) => {
  await selectRepo(name)
  const p = await v1Panel()
  check(p?.startsWith(`${name} (`), `選 ${name} 後面板標題是 ${p}`)
}

/** 解析下方面板的區段:{ 'CHANGES': {n, rows:[{id,name,dir,status}]}, ... }。 */
export const v1Tree = async () => {
  const out = {}
  let cur = null
  const L = await lines()
  // 只看下方面板;上方 repo 清單也有 CHANGES 分組
  for (const [id, t] of L.slice(Math.max(0, UI_MAP.detailStartIndex(L)))) {
    const h = t.match(
      /^按鈕 (CHANGES|STAGED CHANGES|UNTRACKED FILES|COMMITTED ON BRANCH|COMMITS)(?: (\d+))?$/
    )
    if (h) {
      cur = h[1]
      out[cur] = { n: h[2] === undefined ? null : Number(h[2]), rows: [] }
      continue
    }
    if (!cur || cur === 'COMMITS') {
      continue
    }
    const r = t.match(/^text (\S+)(?: ((?![+-] )\S+))?(?: [+-] \d+)? ([A-Z])$/)
    if (r) {
      out[cur].rows.push({ id, name: r[1], dir: r[2] ?? '', status: r[3] })
    }
  }
  return out
}
export const v1Sig = (rows) => rows.map((r) => `${r.name}|${r.dir}|${r.status}`).sort()

/** 區段內第一個符合的列(同名檔在 CHANGES / STAGED 都有時用)。 */
export const v1RowIn = async (sectionRe, rowRe) => rowIn(sectionOf(sectionRe), rowRe)
export const v1BtnAfterId = async (id, btnRe, span = 10) => {
  const L = await lines()
  const i = L.findIndex(([n]) => n === id)
  check(i !== -1, `列 ${id} 不見了`)
  for (let j = i + 1; j < Math.min(L.length, i + span); j++) {
    if (btnRe.test(L[j][1])) {
      return L[j][0]
    }
  }
  throw new Error(`列 ${id} 後面找不到 ${btnRe}`)
}

export const SEC_CH = /^按鈕 CHANGES \d/
export const SEC_ST = /^按鈕 STAGED CHANGES \d/
export const SEC_UN = /^按鈕 UNTRACKED FILES \d/

export const v1Panes = async () => (await findAll(/^彈出式按鈕 Pane Actions$/)).length
export const v1Tabs = async () =>
  (await lines())
    .filter(([, t]) => t.startsWith('sortable '))
    .map(([, t]) => t.replace(/^sortable /, '').replace(/ Close tab.*$/, ''))
export const v1Sel = async () => {
  const g = await grep(/^(text|文字) \d+ selected$/)
  const m = g.match(/ (\d+) selected/)
  return m ? Number(m[1]) : 0
}
export const v1ClearSel = async () => {
  const c = await findAll(/^按鈕 Clear selection/)
  if (c.length) {
    await app.click(c[0])
    await sleep(400)
  }
}
/** 目前顯示的編輯器標頭路徑屬於哪個 repo 資料夾(diff 的按鈕標頭或 edit 分頁的路徑文字)。 */
export const v1HeaderRepo = async () => {
  for (const [, t] of await lines()) {
    const m = t.match(
      /\/MultiProduct\/(WebApp-feature|WebApp|api-server|docs-site|libs\/shared\/core)\//
    )
    if (m) {
      return m[1]
    }
  }
  return null
}
/** 點進 diff 的最後一個 editor(修改端),全選複製,回傳文字;讀不到回 null。 */
export const v1EditorText = async () => {
  const eds = await findAll(/^editor/)
  if (!eds.length) {
    return null
  }
  const r = await copyAndRead(async () => {
    await app.click(eds.at(-1))
    await sleep(400)
    await app.pressKey('cmd+a')
    await sleep(200)
    await app.pressKey('cmd+c')
    return ''
  }, 2500)
  return r.clip
}
/** 內容斷言:讀得到就硬斷言,讀不到回註記字串。 */
export const v1ContentCheck = async (must, mustNot, label) => {
  const t = await v1EditorText()
  if (t === null) {
    return ' (diff 內容未能讀取,需眼看)'
  }
  for (const m of must) {
    check(
      t.includes(m),
      `${label}: diff 內容缺 ${JSON.stringify(m)},實際 ${JSON.stringify(t.slice(0, 120))}`
    )
  }
  for (const m of mustNot) {
    check(!t.includes(m), `${label}: diff 內容不該有 ${JSON.stringify(m)}`)
  }
  return ' (diff 內容已驗證)'
}
/** 左側欄某專案的 main workspace 列。 */
export const v1MainRow = async (project) => {
  const L = await lines()
  const i = L.findIndex(([, t]) =>
    new RegExp(`^按鈕 ${project} Project actions for ${project}`).test(t)
  )
  check(i !== -1, `左側欄找不到專案 ${project}`)
  for (let k = i + 1; k < L.length; k++) {
    if (/^按鈕 \S+ Project actions for /.test(L[k][1])) {
      break
    }
    if (/^text (Active|Inactive) main primary main/.test(L[k][1])) {
      return L[k][0]
    }
  }
  throw new Error(`專案 ${project} 底下找不到 main workspace 列`)
}
/** MultiProduct 整棵檔案雜湊(排除 .git);唯讀。 */
export const v1Snap = () =>
  sh(
    `cd "$P" && find . -name .git -prune -o -type f -print0 | sort -z | xargs -0 shasum | shasum | cut -c1-40`
  ).trim()
export const v1Exists = (path) => sh(`test -e "${path}" && echo yes || echo no`).trim() === 'yes'
export const v1Read = (rel) => fs.readFileSync(`${P}/${rel}`, 'utf8')
/** rs() 預覽字串 → {Create:{n,items}, ...}。 */
export const v1PvGroups = (s) => {
  const parts = s
    .replace(/^PREVIEW: /, '')
    .split('\n')[0]
    .split(' | ')
  const g = {}
  let cur = null
  for (const p of parts) {
    const h = p.match(/^(Create|Overwrite|Delete|Skip)\s+\(\s*(\d+)\s*\)$/)
    if (h) {
      cur = h[1]
      g[cur] = { n: Number(h[2]), items: [] }
    } else if (cur) {
      g[cur].items.push(p)
    }
  }
  return g
}
export const v1Has = (g, grp, re, label) =>
  check(
    g[grp] && re.test(g[grp].items.join(' | ')),
    `${label}: ${grp} 組缺 ${re},實際 ${JSON.stringify(g[grp])}`
  )

// ---------- P:前置(profile 已有群組與 workspace 時只驗證存在) ----------

export const v1TreeNums = async () => {
  const t = await v1Tree()
  return `${t['CHANGES']?.n}/${t['STAGED CHANGES']?.n}`
}
