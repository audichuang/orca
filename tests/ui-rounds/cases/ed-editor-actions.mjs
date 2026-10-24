// ED / SS / MD:編輯器、session 還原、main 端 diff。測案原文見 docs/fork/v2/04-ed.md
// 分段案例 `ID.n`:段與段之間的資料變更/重啟寫在 pre/<ID.n>.sh(函式庫 pre/ed-lib.sh)。
// 重啟後的段(SS-*.2、SS-*.cleanup)要先單獨呼叫 `globalThis.app = await cua.getApp("com.stablyai.orca.dev")` 再跑。
// Monaco 的 diff/編輯內容不在 AX 裡:內容類斷言用磁碟檔/git/Q1/分頁名稱代替,畫面內容以 edShot 截圖附在結果,
// 回傳字串標 [需看截圖] 的地方要人眼確認。

export const edEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
export const edShot = evidenceShot
export const edRead = (rel) => sh(`cat "$P/${rel}"`)

// ---- 分頁 ----
export const edTabs = async () =>
  (await lines())
    // 未存檔分頁在 v1.4.229 以圓點取代關閉鈕,AX 標籤沒有 Close tab
    .filter(([, t]) => /^sortable \S/.test(t) && !/^sortable (Terminal|~)/.test(t))
    .map(([id, t]) => ({ id, name: t.replace(/^sortable /, '').replace(/ Close tab.*$/, '') }))
export const edTabNames = async () => (await edTabs()).map((t) => t.name)
export const edClickTab = async (re, nth = 0) => {
  const hit = (await edTabs()).filter((t) => re.test(t.name))[nth]
  check(hit, `找不到分頁 ${re}(現有:${(await edTabNames()).join(' / ')})`)
  await app.click(hit.id)
  await sleep(1200)
  return hit
}
export const edMode = async (name) => {
  const c = (await lines()).find(([, t]) => new RegExp(`^圓形按鈕 (Description: )?${name}`).test(t))
  check(c, `找不到 ${name} 切換鈕`)
  await app.click(c[0])
  await sleep(1500)
}
export const edHasMode = async (name) =>
  !!(await grep(new RegExp(`^圓形按鈕 (Description: )?${name}`)))
export const edNoDiffError = async (label) => {
  const e = await grep(/Error loading diff|Unable to load file/)
  check(!e, `${label}: 出現讀取錯誤 ${e}`)
}
export const edType = async (text) => {
  const e = (await lines()).filter(([, t]) => t.startsWith('editor (settable)'))
  check(e.length, '找不到 editor')
  await app.click(e.at(-1)[0])
  await app.pressKey('cmd+Down')
  await app.typeText(text)
  await sleep(800)
}

// ---- 開場 / 選取 ----
export const edStart = async () => {
  await app.click(await find(/^(text (Active|Inactive)|container) MultiProduct$/))
  await sleep(1200)
  await closeAll()
  await openMP()
  return await ensure5()
}
export const edWaitUi = async () => {
  for (let k = 0; k < 40; k++) {
    try {
      await find(/^(text (Active|Inactive)|container) MultiProduct$/)
      return
    } catch {
      await sleep(1000)
    }
  }
  throw new Error('重啟後 UI 沒出現 MultiProduct')
}
export const edRepo = async (name) => selectRepo(name)
export const edRowIn = async (sectionRe, rowRe) => rowIn(sectionOf(sectionRe), rowRe)
export const edDbl = async (rowRe, waitMs = 1500) => {
  await app.click(await find(rowRe), { clickCount: 2 })
  await sleep(waitMs)
}
export const edViewAll = async (sectionRe, waitMs = 2200) => {
  await app.click(await sectionButton(sectionOf(sectionRe), /^按鈕 View all/))
  await sleep(waitMs)
}
export const edOpenInEditor = async (fileRe) => {
  const L = await lines()
  const i = L.findIndex(([, t]) => fileRe.test(t))
  check(i !== -1, `combined diff 找不到區段 ${fileRe}`)
  for (let k = i; k < Math.min(L.length, i + 7); k++) {
    if (L[k][1].startsWith('按鈕 Open in editor')) {
      await app.click(L[k][0])
      await sleep(1500)
      return
    }
  }
  throw new Error(`區段 ${fileRe} 附近沒有 Open in editor`)
}
// 左側欄某專案的 main workspace 列
export const edWsRow = async (proj) => {
  const L = await lines()
  const h = L.findIndex(([, t]) =>
    new RegExp(`^按鈕 ${edEsc(proj)} Project actions for ${edEsc(proj)}`).test(t)
  )
  check(h !== -1, `左側欄找不到專案 ${proj}`)
  const r = L.slice(h + 1).find(([, t]) => /^text (Active|Inactive).* main primary main/.test(t))
  check(r, `${proj} 底下找不到 main workspace`)
  return r[0]
}

// ---- Explorer ----
// dirs 逐層展開(已展開不再點),回傳 fileRe 那列的編號
export const edExpand = async (dirs, fileRe) => {
  await app.click(await find(/^按鈕 Explorer/))
  await sleep(1000)
  const steps = [...dirs.map((d) => new RegExp(`^按鈕 ${edEsc(d)}$`)), fileRe]
  let after = -1
  for (let s = 0; s < steps.length; s++) {
    const hit = (await lines()).find(([n, t]) => n > after && steps[s].test(t))
    check(hit, `Explorer 找不到 ${steps[s]}`)
    if (s === steps.length - 1) {
      return hit[0]
    }
    const child = (await lines()).find(([n, t]) => n > hit[0] && steps[s + 1].test(t))
    if (!child) {
      await app.click(hit[0])
      await sleep(800)
    }
    after = hit[0]
  }
}
export const edRename = async (dirs, oldName, newName) => {
  const id = await edExpand(dirs, new RegExp(`^按鈕 ${edEsc(oldName)}$`))
  await app.click(id, { mouseButton: 'right' })
  await sleep(700)
  await app.click(await find(/^Rename/))
  await sleep(700)
  const tf = (await lines()).find(([, t]) =>
    new RegExp(`^文字欄位 \\(settable\\) ${edEsc(oldName)}`).test(t)
  )
  if (tf) {
    await app.setValue(tf[0], newName)
  } else {
    await app.pressKey('cmd+a')
    await app.typeText(newName)
  }
  await app.pressKey('Return')
  await sleep(2000)
}

// ---- Q1(session 內的 edit 分頁)----
export const edQ1 = async () =>
  (await q1())
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const p = l.split(' | ')
      return { owner: p[0], rel: p[1], path: p[2], id: p[3], raw: l }
    })
export const edIdOf = (repo) => new RegExp(`::.*/${edEsc(repo)}$`)
export const edQ1Row = (rows, path) => rows.find((r) => r.path === path)

// ---- 設定 ----
export const edAutoSave = (on) => setAutoSave(on)

// 衝突前置之後 docs-site 的衝突檔列
export const edConflictRowRe = /^text index\.md/
