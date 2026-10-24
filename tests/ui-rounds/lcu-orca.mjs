// lcu 操作 Orca Dev 的輔助函式。用法(第二次 lcu 呼叫起,第一次只能單純 cua.getApp(<round.json 的 app>)):
//   await import(`file://<src>/tests/ui-rounds/lcu-orca.mjs?t=${Date.now()}`);   // ?t= 讓改過的檔重新載入
// Orca 重啟後只要重新 getApp 指派 globalThis.app,函式都讀 globalThis.app 不必重載。
// AX 文字依系統語言是中文角色名(按鈕/文字/核取方塊/彈出式按鈕/標題)。

globalThis.sleep = (ms) => new Promise((r) => setTimeout(r, ms))
globalThis.ax = async () => await app.getAXState({ disableDiffing: true, emit: false })
const map = await import(`${new URL('./ui-map.mjs', import.meta.url).href}?t=${Date.now()}`)
globalThis.UI_RE = map.RE
globalThis.UI_MAP = map
globalThis.esc = map.esc
globalThis.sectionOf = (re) => (typeof re === 'string' ? re : map.sectionNameOf(re))
globalThis.openRepoName = async () => map.openRepoName(await lines())
globalThis.openRepoTitle = async () => map.openRepoTitle(await lines())
// AX 行一律換成 ui-map 的標準形式(中文角色名、repo 列「name (branch) N」),案例只比對標準形式
globalThis.lines = async () =>
  (await ax())
    .split('\n')
    .map((l) => l.match(/^\s*(\d+) (.*)$/))
    .filter(Boolean)
    .map((m) => [Number(m[1]), map.canonicalLine(m[2])])
globalThis.find = async (re) => {
  const h = (await lines()).find(([, t]) => re.test(t))
  if (!h) {
    throw new Error(`not found ${re}`)
  }
  return h[0]
}
globalThis.findAll = async (re) => (await lines()).filter(([, t]) => re.test(t)).map(([i]) => i)
globalThis.grep = async (re) =>
  (await lines())
    .filter(([, t]) => re.test(t))
    .map(([i, t]) => `${i} ${t}`)
    .join('\n')
// 列後面 span 行內的按鈕(例:某 repo 列的 Copy all changes、某檔案列的 Stage)
globalThis.btnAfter = async (rowRe, btnRe, span = 6) => {
  const L = await lines()
  const i = L.findIndex(([, t]) => rowRe.test(t))
  if (i === -1) {
    throw new Error(`row not found ${rowRe}`)
  }
  for (let j = i + 1; j < Math.min(L.length, i + span); j++) {
    if (btnRe.test(L[j][1])) {
      return L[j][0]
    }
  }
  throw new Error(`btn not found ${btnRe}`)
}
// 雙擊開分頁;通知或選單剛關時第一下常被吞掉,沒看到 tabRe 就再雙擊一次
globalThis.dblOpen = async (rowRe, tabRe, wait = 1800) => {
  for (let k = 0; k < 2; k++) {
    await app.click(await find(rowRe), { clickCount: 2 })
    await sleep(wait)
    if (await grep(tabRe)) {
      return true
    }
  }
  return false
}
/** 輪詢 fn 到回傳 truthy 或逾時(回傳 null) */
globalThis.waitFor = async (fn, ms = 8000, step = 300) => {
  const t0 = Date.now()
  for (;;) {
    const v = await fn()
    if (v) {
      return v
    }
    if (Date.now() - t0 > ms) {
      return null
    }
    await sleep(step)
  }
}
globalThis.clickRe = async (re, opts) => {
  await app.click(await find(re), opts)
  await sleep(800)
}

// ---- MultiProduct fixture ----
globalThis.REPOS = ['api-server', 'core', 'docs-site', 'WebApp', 'WebApp-feature']
// 收起的 NO CHANGES 群組先展開,沒有變更的 repo 才會列出
globalThis.counts = async () => {
  await expandRepoGroups()
  return await grep(map.RE.anyRepoRow)
}
// 通知的標準形式(ui-map 的 toastNote),前面保留元素編號與角色,跟舊的 grep 輸出同形
globalThis.note = async () => {
  const L = await lines()
  const text = map.toastNote(L)
  if (!text) {
    return 'none'
  }
  const id = L.find(([, t]) => t.endsWith(text.split('.')[0]))?.[0] ?? 0
  return `${id} 文字 ${text}`
}
// 大檔複製要好幾秒才出通知,輪詢到出現為止
globalThis.waitNote = async (ms = 8000) =>
  (await waitFor(async () => {
    const n = await note()
    return n === 'none' ? null : n
  }, ms)) ?? 'none'
// 持續顯示的通知(例如 token 門檻警告)會讓後面的 note() 讀到舊文字
globalThis.dismissToasts = async () => {
  for (let k = 0; k < 10; k++) {
    const b = (await lines()).find(([, t]) => t === `按鈕 ${map.UI_TEXT.closeToast}`)
    if (!b) {
      return
    }
    // 通知可能在找到後、點下前自己消失
    try {
      await app.click(b[0])
    } catch {}
    await sleep(300)
  }
}
/** 左側欄捲回頂端:列不在畫面上(或藏在吸頂的群組標題下)時點不到 */
globalThis.scrollSidebarTop = async () => {
  const list = (await lines()).find(([, t]) => t === `清單方塊 ${map.UI_TEXT.worktreeList}`)
  if (list) {
    await app.scroll(list[0], 'up', 5)
    // 捲動後 AX 的座標要過一會、再觀察一次畫面才更新
    await sleep(1000)
    await app.getScreenshot({ emit: false })
  }
}
/** 左側欄某 workspace 列可點的位置:列標籤的 AX 框不一定在畫面上的那一列,改點緊接的可見文字 */
globalThis.workspaceRowTarget = async (name) => {
  const L = await lines()
  const k = L.findIndex(([, t]) => map.RE.workspaceRow(name).test(t))
  if (k === -1) {
    return null
  }
  return L[k + 1]?.[1].startsWith('文字 ') ? L[k + 1][0] : L[k][0]
}
// 用頂部的 Search worktrees 切換 workspace:左側欄是虛擬清單,捲動後 AX 回報的列座標會偏掉,點列不可靠
globalThis.switchWorkspace = async (name) => {
  await app.click(await find(map.RE.button(map.UI_TEXT.searchWorktrees)))
  await sleep(800)
  await app.typeText(name)
  await sleep(1000)
  // 選項像「(selected) Active MultiProduct Last active 24m ago」;要整個名稱相符,MultiProduct-2 不算
  const opt = new RegExp(`^(\\(selected\\) )?((Active|Inactive) )?${map.esc(name)}( Last|$)`)
  const hit = (await lines()).find(([, t]) => opt.test(t))
  if (!hit) {
    await app.pressKey('Escape')
    return false
  }
  await app.click(hit[0])
  await sleep(1500)
  return true
}
// 打開 MultiProduct 的 Source Control;點了沒切過去就重試(視窗剛拿到焦點時第一下常被吞)
globalThis.openMP = async (name = 'MultiProduct') => {
  // 左側欄群組標題也叫 MultiProduct,要看 folder 面板標題列的名稱
  const ready = async () => map.folderPanelName(await lines()) === name
  let ok = await ready()
  for (let k = 0; k < 3 && !ok; k++) {
    await switchWorkspace(name)
    const L = await lines()
    const has = (label) => L.find(([, t]) => t.startsWith(`按鈕 ${label}`))
    if (!has(map.UI_TEXT.refreshAll)) {
      let sc = has(map.UI_TEXT.sourceControlTab)
      const toggle = has(map.UI_TEXT.toggleRightSidebar)
      // 右側欄關著(例:SC-28 關掉後)時先打開
      if (!sc && toggle) {
        await app.click(toggle[0])
        await sleep(1000)
        sc = (await lines()).find(([, t]) => t.startsWith(`按鈕 ${map.UI_TEXT.sourceControlTab}`))
      }
      if (sc) {
        await app.click(sc[0])
        await sleep(1500)
      }
    }
    ok = await ready()
  }
  if (!ok) {
    throw new Error(`打不開 ${name} 的 Source Control`)
  }
  await expandRepoGroups()
}
// 收起的 repo 群組(NO CHANGES)展開,案例才看得到每個 repo 列
globalThis.expandRepoGroups = async () => {
  const L = await lines()
  for (const [k, [id, t]] of L.entries()) {
    if (
      map.RE.repoGroupHeader.test(t) &&
      !L.slice(k + 1, k + 5).some(([, u]) => map.RE.anyRepoRow.test(u))
    ) {
      await app.click(id)
      await sleep(500)
    }
  }
}
// 選右側 repo 清單的一列,確認下方面板換成那個 repo
globalThis.selectRepo = async (name, branch) => {
  for (let k = 0; k < 3; k++) {
    if (map.openRepoName(await lines()) === name) {
      return
    }
    await app.click(await find(map.RE.repoRow(name, branch)))
    await sleep(1000)
  }
  if (map.openRepoName(await lines()) !== name) {
    throw new Error(`選不到 repo ${name}`)
  }
}
// 目前開著的 repo 面板裡,某區段(CHANGES、STAGED CHANGES…)的列、列上的按鈕
globalThis.rowIn = async (name, rowRe) => {
  const L = await lines()
  const k = map.rowIndexIn(L, sectionOf(name), rowRe)
  if (k < 0) {
    throw new Error(`區段 ${sectionOf(name)} 內找不到 ${rowRe}`)
  }
  return L[k][0]
}
globalThis.sectionButton = async (name, btnRe) => {
  const L = await lines()
  const r = map.sectionRange(L, sectionOf(name))
  if (!r) {
    throw new Error(`面板裡找不到區段 ${name}`)
  }
  const hit = L.slice(r[0] + 1, r[1]).find(([, t]) => btnRe.test(t))
  if (!hit) {
    throw new Error(`區段 ${name} 找不到 ${btnRe}`)
  }
  return hit[0]
}
// 重置 fixture 後 repo 可能從清單消失:開 Show hidden worktrees 再關掉觸發重掃
globalThis.ensure5 = async () => {
  const refresh = map.RE.button(map.UI_TEXT.refreshAll)
  await app.click(await find(refresh))
  await sleep(3500)
  const c = await counts()
  const missing = REPOS.filter((r) => !new RegExp(` ${map.esc(r)} \\(`).test(c))
  if (!missing.length) {
    return c
  }
  for (const r of missing) {
    const proj = r === 'WebApp-feature' ? 'WebApp' : r
    try {
      await app.click(await find(new RegExp(`^彈出式按鈕 Project actions for ${proj}$`)))
      await sleep(700)
      await app.click(await find(/^Show hidden worktrees/))
      await sleep(1500)
      await app.pressKey('Escape')
      await sleep(800)
    } catch {}
  }
  await app.click(await find(refresh))
  await sleep(3000)
  return await counts()
}
globalThis.rowCopy = async (repoRe) => {
  await app.click(await btnAfter(repoRe, map.RE.button(map.UI_TEXT.copyAllChanges), 10))
  await sleep(500)
  return await waitNote()
}
globalThis.ctxCopy = async (rowId) => {
  await app.click(rowId, { mouseButton: 'right' })
  await sleep(700)
  const c = await findAll(new RegExp(`^${map.UI_TEXT.copyFullSource}`))
  check(c.length > 0, `右鍵選單沒有 ${map.UI_TEXT.copyFullSource}`)
  await app.click(c.at(-1))
  await sleep(1300)
  const n = await note()
  const cl = await findAll(/^按鈕 Clear selection/)
  if (cl.length) {
    await app.click(cl[0])
    await sleep(300)
  }
  return n
}
// 關掉最後一個分頁會讓 workspace 失去選取,關完重新打開 MultiProduct
globalThis.closeAll = async () => {
  for (let k = 0; k < 20; k++) {
    const ids = await findAll(map.RE.button(map.UI_TEXT.closeTab))
    if (!ids.length) {
      break
    }
    await app.click(ids[0])
    await sleep(350)
    const b = (await lines()).find(([, t]) => t.startsWith("按鈕 Don't Save"))
    if (b) {
      await app.click(b[0])
      await sleep(300)
    }
  }
  await openMP()
}
globalThis.importFolder = async (path) => {
  await app.click(await find(/^按鈕 Add project$/))
  await sleep(1200)
  await app.click(await find(/^按鈕 Browse folder/))
  await sleep(1500)
  await app.pressKey('cmd+shift+g')
  await sleep(800)
  await app.setValue(await find(/PathTextField|^文字欄位 \(settable\)/), path)
  await app.pressKey('Return')
  await sleep(1200)
  await app.click(await find(/^按鈕 打開/))
  await sleep(2500)
  return await grep(/Import|import|Found|repositor|Add|added|project/i)
}
globalThis.removeProj = async (name) => {
  await app.click(await find(new RegExp(`^彈出式按鈕 Project actions for ${name}$`)))
  await sleep(700)
  await app.click(await find(/^Remove Project/))
  await sleep(1000)
  const c = (await lines()).filter(([, t]) => /^按鈕 Remove( Project)?$/.test(t))
  if (c.length) {
    await app.click(c.at(-1)[0])
    await sleep(1500)
  }
}

// ---- Paste & Restore 對話框 ----
globalThis.pv = async () => {
  const L = await lines()
  const i = L.findIndex(([, t]) => t.startsWith('標題 Paste & Restore'))
  if (i === -1) {
    return `NO PREVIEW: ${await note()}`
  }
  const out = []
  for (let k = i + 3; k < L.length; k++) {
    const t = L[k][1]
    if (/^按鈕 Close$/.test(t)) {
      break
    }
    if (/^(container|內容列表)$/.test(t)) {
      continue
    }
    out.push(t.replace(/^(文字|text) /, ''))
  }
  return out.join(' | ')
}
// Paste & Restore 的結果通知(沒有預覽時直接出現)
const RESTORE_RESULT = /Created \d|Failed|failed|No Snipcode|Clipboard is empty/
/** 按 Paste & Restore,等預覽對話框或結果通知;大的 payload 要先讀檔比對,預覽可能晚幾秒才出現。回傳有沒有預覽。 */
globalThis.openRestorePreview = async () => {
  // 上一案的結果通知還在會被誤讀
  for (let k = 0; k < 20 && (await grep(RESTORE_RESULT)); k++) {
    await sleep(500)
  }
  await app.click(await find(/^按鈕 Paste & Restore/))
  for (let k = 0; k < 8; k++) {
    await sleep(700)
    if (await grep(/^標題 Paste & Restore/)) {
      return true
    }
    if (await grep(RESTORE_RESULT)) {
      return false
    }
  }
  return false
}
globalThis.rs = async ({ toggleAdjust = false, overwrite = false, restore = true } = {}) => {
  const cancel = async () => {
    const c = (await lines()).find(([, t]) => /^按鈕 Cancel$/.test(t))
    if (c) {
      await app.click(c[0])
    }
  }
  await openRestorePreview()
  let r = `PREVIEW: ${await pv()}`
  if (toggleAdjust) {
    const cb = (await lines()).find(([, t]) => t.startsWith('核取方塊 Adjust paths'))
    if (cb) {
      await app.click(cb[0])
      await sleep(700)
      r += `\nUNCHECKED: ${await pv()}`
      await app.click(cb[0])
      await sleep(700)
    }
  }
  if (!restore) {
    await cancel()
    return r
  }
  if (overwrite) {
    const o = (await lines()).find(([, t]) => t.startsWith('核取方塊 Overwrite existing files'))
    if (o) {
      await app.click(o[0])
      await sleep(300)
    }
  }
  const rb = (await lines()).find(([, t]) => /^按鈕 (\(disabled\) )?Restore$/.test(t))
  if (!rb || /disabled/.test(rb[1])) {
    await cancel()
    return `${r}\nRESTORE DISABLED`
  }
  await app.click(rb[0])
  for (let k = 0; k < 12; k++) {
    await sleep(150)
    const g = await grep(/Created \d|Failed|failed/)
    if (g) {
      return `${r}\nRESULT: ${g}`
    }
  }
  return `${r}\nRESULT: none`
}

// 每輪一開始先跑:確認案例共用的定位在這個 build 上都找得到。回傳 STALE 清單,空的才開始跑案例
globalThis.preflight = async () => {
  const stale = []
  const ok = async (name, fn) => {
    try {
      if (!(await fn())) {
        stale.push(name)
      }
    } catch (e) {
      stale.push(`${name}(${String(e.message).slice(0, 80)})`)
    }
  }
  await ok('openMP', async () => {
    await openMP()
    return true
  })
  for (const key of [
    'refreshAll',
    'copyAllChanges',
    'pasteRestore',
    'addReposInFolder',
    'openGitGraph'
  ]) {
    await ok(key, async () => grep(map.RE.button(map.UI_TEXT[key])))
  }
  await ok('repoRow(≥4)', async () => (await findAll(map.RE.anyRepoRow)).length >= 4)
  await ok('selectRepo(WebApp)', async () => {
    await selectRepo('WebApp', 'main')
    return true
  })
  await ok('detailStart', async () => map.detailStartIndex(await lines()) > 0)
  for (const sec of ['CHANGES', 'STAGED CHANGES']) {
    await ok(`section ${sec}`, async () => map.sectionRange(await lines(), sec))
  }
  await ok('fileRow partial.ts', async () => rowIn('CHANGES', /^text partial\.ts src/))
  for (const key of ['copyFullSource', 'viewAll']) {
    await ok(key, async () => sectionButton('CHANGES', map.RE.button(map.UI_TEXT[key])))
  }
  return stale.length ? `STALE: ${stale.join(', ')}` : 'preflight ok'
}

// Settings 的 Auto Save Files;profile 會留著上一輪的值,依賴存檔行為的案例先明確設定。delay(ms)選填
globalThis.setAutoSave = async (on, delay) => {
  await app.click(await find(map.RE.button(map.UI_TEXT.settings)))
  await sleep(1800)
  await app.setValue(await find(/^文字欄位 \(settable\).*Search settings/), 'auto save')
  await sleep(1200)
  const toggle = new RegExp(`^切換 Description: ${map.UI_TEXT.autoSaveFiles}`)
  const value = new RegExp(`${map.UI_TEXT.autoSaveFiles}, Value`)
  const isOn = async () => /Value: on/.test(await grep(value))
  if (on && !(await isOn())) {
    await app.click(await find(toggle))
    await sleep(600)
  }
  // setValue 不會送出設定,要點欄位打字再按 Return
  if (delay) {
    await app.click(await find(/^步進器/))
    await app.pressKey('cmd+a')
    await app.typeText(String(delay))
    await app.pressKey('Return')
    await sleep(600)
  }
  if (!on && (await isOn())) {
    await app.click(await find(toggle))
    await sleep(600)
  }
  const after = await grep(value)
  if (/Value: on/.test(after) !== on) {
    throw new Error(`Auto Save 沒切成 ${on ? 'on' : 'off'}:${after}`)
  }
  const back = await findAll(map.RE.button(map.UI_TEXT.backToApp))
  await (back.length ? app.click(back[0]) : app.pressKey('Escape'))
  await sleep(1000)
  return after
}
nodeRepl.write('lcu-orca helpers loaded')
