// CC:Copy Full Source。測案原文見 docs/fork/v2/02-cc.md
export const ROOT = '// clipcode-root: MultiProduct\n'

// 依區段找列:回傳 section 標題之後、下一個區段標題之前,符合 rowRe 的第一個元素編號
export const rowInSection = async (sectionRe, rowRe) => rowIn(sectionOf(sectionRe), rowRe)

// ---- CC-03 起 ----
export const ccNote = async () => note()
// 大檔複製要好幾秒才出通知,輪詢到出現為止
export const ccWaitNote = async (ms = 8000) => {
  for (let t = 0; t < ms; t += 300) {
    const n = await ccNote()
    if (n !== 'none') {
      return n
    }
    await sleep(300)
  }
  return 'none'
}
export const ccRowCopy = async (repoRe) => {
  await app.click(await btnAfter(repoRe, /^按鈕 Copy all changes$/, 10))
  await sleep(500)
  return await ccWaitNote()
}
export const ccSecCopy = async (sectionRe) => {
  await app.click(await sectionButton(sectionOf(sectionRe), /^按鈕 Copy Full Source/))
  await sleep(500)
  return await ccWaitNote()
}
export const ccCtxCopy = async (rowId) => {
  await app.click(rowId, { mouseButton: 'right' })
  await sleep(700)
  const c = await findAll(/^Copy Full Source/)
  check(c.length > 0, '右鍵選單沒有 Copy Full Source')
  await app.click(c.at(-1))
  await sleep(1300)
  const n = await ccNote()
  const cl = await findAll(/^按鈕 Clear selection/)
  if (cl.length) {
    await app.click(cl[0])
    await sleep(300)
  }
  return n
}
export const ccRefresh = async (wait = 3000) => {
  await app.click(await find(/^按鈕 Refresh all repositories/))
  await sleep(wait)
}
export const ccSelect = async (repoRe, markerRe) => {
  if (markerRe && (await grep(markerRe))) {
    return
  }
  await app.click(await find(repoRe))
  await sleep(1200)
}
export const ccStat = (text, expected, label) => checkEq(statsOf(text), expected, `${label} 統計`)
// 某專案標題之後第一個符合 rowRe 的 workspace 列
export const ccWorktreeRow = async (project, rowRe) => {
  const L = await lines()
  const s = L.findIndex(([, t]) => new RegExp(`^按鈕 ${project} Project actions`).test(t))
  check(s !== -1, `找不到專案 ${project}`)
  for (let k = s + 1; k < L.length; k++) {
    if (/^按鈕 [\w-]+ Project actions/.test(L[k][1])) {
      break
    }
    if (rowRe.test(L[k][1])) {
      return L[k][0]
    }
  }
  throw new Error(`專案 ${project} 底下找不到 ${rowRe}`)
}
export const ccEnsureSourceControl = async (markerRe) => {
  if (await grep(markerRe)) {
    return
  }
  const sc = (await lines()).find(([, t]) => t.startsWith('按鈕 Source Control'))
  if (sc) {
    await app.click(sc[0])
    await sleep(1500)
  }
}
export const ccOtherLocations = async (mode) => {
  await app.click(await find(/^彈出式按鈕 Project actions for WebApp$/))
  await sleep(700)
  const it = (await lines()).find(([, t]) =>
    /^(Show hidden worktrees|Hide non-Orca worktrees)/.test(t)
  )
  check(it, '專案選單沒有 Show hidden worktrees / Hide non-Orca worktrees')
  await app.click(it[0])
  await sleep(1500)
  const L = await lines()
  const i = L.findIndex(([, t]) => t.startsWith('text Other locations'))
  check(i !== -1, '對話框沒有 Other locations')
  const radio = L.slice(i, i + 6).find(([, t]) => new RegExp(`^圓形按鈕 ${mode}`).test(t))
  check(radio, `Other locations 底下找不到 ${mode}`)
  await app.click(radio[0])
  await sleep(1200)
  await app.click(await find(/^按鈕 Close$/))
  await sleep(800)
  await openMP()
}

export const W_PARTIAL = `${ROOT}\n// file: [MODIFIED] WebApp/src/partial.ts\npartial\nline2\nline3\nindex-edit\nworktree-edit\n\n\n`
