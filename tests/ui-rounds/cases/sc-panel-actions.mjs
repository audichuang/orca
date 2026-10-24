// SC:Source Control 面板。測案原文見 docs/fork/v2/01-sc.md
// 約定:需要寫檔/git/重啟 Orca 的步驟放在 pre/<ID>.sh;中途要改資料的案例拆成 SC-xx.1、.2…
// 斷言的是測案文件寫的成功條件(commit 7c5edf3e8 修正後的行為),不是舊的錯誤行為。
export const AGENT_PROMPT =
  'Reply only with the output of pwd. Do not run any other command and do not modify anything.'

// ---------- 共用小工具 ----------
export const blocked = (msg) => {
  throw new Error(msg)
} // 非 CaseFail → runner 記 BLOCKED
export const need = (v, msg) => {
  if (!v) {
    throw new Error(msg)
  }
  return v
}
export const scStart = async () => {
  await closeAll()
  return await ensure5()
}
export const scCnt = async (name) => {
  const m = (await counts()).match(new RegExp(`按鈕 ${esc(name)} \\([^)]*\\) (\\d+)`))
  return m ? Number(m[1]) : null
}
export const scAllCnt = async () => {
  const o = {}
  for (const r of REPOS) {
    o[r] = await scCnt(r)
  }
  return o
}
// 區段標題的數字(CHANGES / STAGED CHANGES / UNTRACKED FILES)
export const scSec = async (label) => {
  const L = await lines()
  const r = UI_MAP.sectionRange(L, label)
  return r ? Number(L[r[0]][1].replace(/^\D+/, '')) : 0
}
export const scRowIdx = (L, sectionRe, rowRe) => {
  const k = UI_MAP.rowIndexIn(L, sectionOf(sectionRe), rowRe)
  if (k < 0) {
    throw new Error(`區段 ${sectionOf(sectionRe)} 內找不到 ${rowRe}`)
  }
  return k
}
export const scRowId = async (sectionRe, rowRe) => {
  const L = await lines()
  return L[scRowIdx(L, sectionRe, rowRe)][0]
}
export const scRowBtn = async (sectionRe, rowRe, btnRe, span = 6) => {
  const L = await lines()
  const k = scRowIdx(L, sectionRe, rowRe)
  for (let j = k + 1; j < Math.min(L.length, k + span); j++) {
    if (L[j][1] === 'container') {
      break
    }
    if (btnRe.test(L[j][1])) {
      return L[j][0]
    }
  }
  throw new Error(`列 ${rowRe} 後找不到按鈕 ${btnRe}`)
}
export const scHasRow = async (sectionRe, rowRe) => {
  try {
    await scRowId(sectionRe, rowRe)
    return true
  } catch {
    return false
  }
}
export const CH = /^按鈕 CHANGES \d/,
  ST = /^按鈕 STAGED CHANGES \d/,
  UT = /^按鈕 UNTRACKED FILES \d/
// 對話框:回傳標題與前幾行文字
export const scDlg = async () => {
  const L = await lines()
  const i = L.findIndex(([, t]) => t.startsWith('標題 '))
  if (i === -1) {
    return null
  }
  return {
    title: L[i][1].replace(/^標題 /, '').replace(/, Value: \d+$/, ''),
    text: L.slice(i, i + 6)
      .map((x) => x[1])
      .join(' | ')
  }
}
export const scConfirm = async (re, wait = 2500) => {
  const ids = await findAll(re)
  need(ids.length, `找不到確認鈕 ${re}`)
  await app.click(ids.at(-1))
  await sleep(wait)
}
export const scSelected = async () =>
  ((await grep(/^text \d+ selected/)) || '').replace(/^\d+ text /, '') || 'none'
// 左側欄某專案底下 main 工作區那一列
export const scMainRow = async (project) => {
  const L = await lines()
  const i = L.findIndex(([, t]) => new RegExp(`^按鈕 ${esc(project)} Project actions for `).test(t))
  need(i !== -1, `左側欄找不到專案 ${project}`)
  for (let j = i + 1; j < Math.min(L.length, i + 25); j++) {
    if (/^text (Active|Inactive) main primary main$/.test(L[j][1])) {
      return L[j][0]
    }
  }
  throw new Error(`左側欄 ${project} 底下找不到 main 工作區`)
}
export const scPanelTitle = async () => (await openRepoName()) ?? '?'
export const scShell = (cmd) => sh(cmd, { allowFail: true })
export const scGrepC = (pat, file) =>
  Number(scShell(`grep -c ${pat} ${file}`).trim().split('\n')[0] || 0) // grep -c 沒命中時印 0
export const scLines = (file) => Number(scShell(`wc -l < ${file}`).trim())
export const scPorcelain = (repo) => scShell(`git -C ${repo} status --porcelain`)

// Settings 頁
export const scSettings = async (query) => {
  await app.click(await find(/^按鈕 Settings$/))
  await sleep(1800)
  if (query) {
    await app.setValue(await find(/^文字欄位 \(settable\).*Search settings/), query)
    await sleep(1200)
  }
}
export const scSettingsBack = async () => {
  const b = await findAll(/^按鈕 Back to app/)
  await (b.length ? app.click(b[0]) : app.pressKey('Escape'))
  await sleep(1000)
}

// Choose agent → Customize launch… / Resolve with AI 之後的「Review the prompt」對話框:改成 pwd 提示、不儲存 → 啟動
export const scAgentDialog = async () => {
  const L = await lines()
  const pt = L.find(([, t]) => t.startsWith('文字項目區域 (settable) Prompt template'))
  const cli = L.find(([, t]) => t.startsWith('文字欄位 (settable) CLI arguments'))
  const cb = L.find(([, t]) => /^核取方塊 .*Save this prompt/.test(t))
  need(pt && cli, '找不到 Prompt template / CLI arguments 欄位')
  await app.setValue(pt[0], AGENT_PROMPT)
  await app.setValue(cli[0], '--model haiku')
  await sleep(300)
  if (cb && /Value: 1/.test(cb[1])) {
    await app.click(cb[0])
    await sleep(400)
  }
  const b = (await lines()).find(([, t]) => /^按鈕 (Save & start agent|Start agent)/.test(t))
  need(b, '找不到 Start agent 按鈕')
  await app.click(b[0])
}
// agent 啟動後:等分頁、嘗試從 AX 讀信任提示的 cwd(終端機文字不一定在 AX 裡)、Ctrl+C 並關掉新終端機
export const scAgentObserve = async (wsName) => {
  await sleep(10000)
  const tabs = (await grep(/^sortable Terminal/)) || ''
  const active = await grep(new RegExp(`^text Active ${esc(wsName)}$`))
  const acc = (await grep(/Accessing workspace/)) || ''
  return { tabs, active, acc }
}
export const scStopAgent = async () => {
  await app.pressKey('ctrl+c')
  await sleep(600)
  await app.pressKey('ctrl+c')
  await sleep(800)
  for (let k = 0; k < 4; k++) {
    const t = (await lines()).filter(([, x]) => /^按鈕 Close tab Terminal [2-9]/.test(x))
    if (!t.length) {
      break
    }
    await app.click(t.at(-1)[0])
    await sleep(800)
    const c = (await lines()).find(([, x]) =>
      /^按鈕 (Close|Terminate|Kill|Close Terminal)$/.test(x)
    )
    if (c) {
      await app.click(c[0])
      await sleep(600)
    }
  }
}
export const scCloseOtherLocations = async () => {
  const c = await findAll(/^按鈕 Close$/)
  if (c.length) {
    await app.click(c.at(-1))
    await sleep(800)
  }
}
// WebApp 專案的 Other locations 設為 mode('Show' | 'Hide')
export const scOtherLocations = async (project, mode) => {
  await app.click(await find(new RegExp(`^彈出式按鈕 Project actions for ${esc(project)}$`)))
  await sleep(700)
  await app.click(await find(/^(Show hidden worktrees|Hide non-Orca worktrees)/))
  await sleep(1500)
  const L = await lines()
  const i = L.findIndex(([, t]) => /^text Other locations \d+ found/.test(t))
  need(i !== -1, '找不到 Other locations 區塊')
  const r = L.slice(i).find(([, t]) => new RegExp(`^圓形按鈕 ${mode}, Value: 0`).test(t))
  if (r) {
    await app.click(r[0])
    await sleep(1200)
  }
  // 讀專案自己的單選鈕;下方「text Other locations Hide」是全域設定清單,不是這個專案的值
  const L2 = await lines()
  const v = L2.findIndex(([, t]) => t.startsWith('Visibility for Other locations'))
  const on = L2.slice(v + 1, v + 3).find(([, t]) => /Value: 1/.test(t))
  const state = `Other locations ${on ? on[1].replace(/^圓形按鈕 (\w+).*/, '$1') : '?'}`
  await scCloseOtherLocations()
  return state
}
export const scDeleteGroup = async (name) => {
  await app.click(await find(new RegExp(`^彈出式按鈕 Group actions for ${esc(name)}`)))
  await sleep(700)
  await app.click(await find(/^Delete group/))
  await sleep(1000)
  const b = (await lines()).filter(([, t]) => /^按鈕 (Delete group|Delete|Remove)$/i.test(t))
  if (b.length) {
    await app.click(b.at(-1)[0])
    await sleep(2000)
  }
}
export const scCreateWorkspace = async (forName, wsName) => {
  await app.click(await find(new RegExp(`^按鈕 Create workspace for ${esc(forName)}`)))
  await sleep(1500)
  await app.click(await find(/^下拉式方塊 \(settable\) (Claude|Blank Terminal|Codex)/))
  await sleep(700)
  await app.click(await find(/^Blank Terminal/))
  await sleep(500)
  await app.setValue(await find(/^文字欄位 \(settable\).*(Type a name|Placeholder)/), wsName)
  await sleep(600)
  const sug = (await lines()).find(([, t]) =>
    new RegExp(`Use "${esc(wsName)}" as workspace name`).test(t)
  )
  if (sug) {
    await app.click(sug[0])
    await sleep(400)
  }
  await app.click(await find(/^按鈕 Create workspace/))
  await sleep(3000)
}
