// RS:Paste & Restore。測案原文見 docs/fork/v2/03-rs.md
// 每案的 pre/<ID>.sh 負責:重置 fixture、pbcopy payload、算 shasum 基準。lcu 端只做 UI 與唯讀斷言。
// 分段案例(RS-14a/b、RS-20 cleanup)必須依序執行:.1 → Bash 跑 pre/<ID>.2.sh → .2。
import fs from 'node:fs'

export const RS_GROUPS = ['Create', 'Overwrite', 'Delete', 'Skip']
export const RS_STALE = /Created \d|Failed|failed|No Snipcode|Clipboard is empty/
export const rsTop = () => P.replace(/\/MultiProduct$/, '')

globalThis.rsEx = (p) => {
  try {
    sh(`test -e '${p.replace(/'/g, `'\\''`)}'`)
    return true
  } catch {
    return false
  }
}
globalThis.rsRead = (rel) => fs.readFileSync(`${P}/${rel}`, 'utf8')
// shasum 基準檔(pre 腳本寫的 `shasum <abs paths>` 輸出)
globalThis.rsShaOk = (file, label) => {
  const out = sh(`shasum -c '${file}' 2>&1`, { allowFail: true })
  check(
    /: OK/.test(out) && !/FAILED|did NOT|No such|not found/i.test(out),
    `${label}: shasum 與基準不同 ${out.slice(0, 160)}`
  )
}

// pv() 的文字 → { Create:{n,items}, Overwrite, Delete, Skip:{n,items:[{path,reason}]} };標題間距有 "Create  ( 1 )" 與 "Create | ( | 4 | )" 兩種寫法
globalThis.rsParse = (txt) => {
  const s = txt.replace(/ \| /g, '¦')
  const heads = [...s.matchAll(/(Create|Overwrite|Delete|Skip)[ ¦]*\([ ¦]*(\d+)[ ¦]*\)/g)]
  const g = {}
  heads.forEach((m, i) => {
    const body = s.slice(
      m.index + m[0].length,
      i + 1 < heads.length ? heads[i + 1].index : s.length
    )
    let toks = body
      .split('¦')
      .map((x) => x.trim())
      .filter(Boolean)
    const cut = toks.findIndex((t) => /^(核取方塊|按鈕) /.test(t))
    if (cut !== -1) {
      toks = toks.slice(0, cut)
    }
    if (m[1] === 'Skip') {
      const items = []
      for (let k = 0; k < toks.length; k++) {
        if (toks[k].startsWith('container ')) {
          items.push({ path: toks[k].slice(10), reason: toks[k + 1] ?? '' })
          k += 2
        }
      }
      g[m[1]] = { n: Number(m[2]), items }
    } else {
      g[m[1]] = { n: Number(m[2]), items: toks }
    }
  })
  return g
}

globalThis.rsView = async () => {
  const L = await lines()
  if (!L.some(([, t]) => t.startsWith('標題 Paste & Restore'))) {
    return { open: false }
  }
  const raw = await pv()
  const box = (re) => {
    const m = L.map(([, t]) => t.match(re)).find(Boolean)
    return m ? m : null
  }
  const a = box(/^核取方塊 Adjust paths \(([^)]*)\), Value: (\d)/)
  const o = box(/^核取方塊 Overwrite existing files, Value: (\d)/)
  return {
    open: true,
    raw,
    g: rsParse(raw),
    adjust: a ? { label: a[1], on: a[2] === '1' } : null,
    overwriteBox: o ? { on: o[1] === '1' } : null,
    restoreDisabled: L.some(([, t]) => /^按鈕 \(disabled\) Restore$/.test(t))
  }
}

// spec 例:{Create:['a','b'], Skip:['p :: reason', 'p2']};沒列的分組必須不存在;Skip 項目不寫 ' :: ' 就只比路徑
globalThis.rsExpect = (label, v, spec) => {
  check(v.open, `${label}: 沒有出現預覽對話框`)
  for (const name of RS_GROUPS) {
    const exp = spec[name] ?? []
    const act = v.g[name]
    check(
      act ? act.n === exp.length : exp.length === 0,
      `${label}: ${name} 數量實際 ${act ? act.n : 0} 預期 ${exp.length}。預覽:${v.raw.slice(0, 300)}`
    )
    if (!exp.length) {
      continue
    }
    const left =
      name === 'Skip' ? act.items.map((x) => ({ ...x })) : act.items.map((p) => ({ path: p }))
    for (const e of exp) {
      const [p, r] = e.split(' :: ')
      const i = left.findIndex((x) => x.path === p && (r === undefined || x.reason === r))
      check(i !== -1, `${label}: ${name} 缺 ${e}。預覽:${v.raw.slice(0, 300)}`)
      left.splice(i, 1)
    }
    check(!left.length, `${label}: ${name} 多出 ${JSON.stringify(left)}`)
  }
}
globalThis.rsBrief = (v) =>
  RS_GROUPS.filter((n) => v.g?.[n])
    .map((n) => `${n}(${v.g[n].n})`)
    .join(' ')

globalThis.rsCancel = async () => {
  const c = (await lines()).find(([, t]) => /^按鈕 Cancel$/.test(t))
  if (c) {
    await app.click(c[0])
    await sleep(500)
  }
}
// 按 Restore 並等結果通知;回傳 grep 到的通知行,等不到回 'none'
globalThis.rsClickRestore = async () => {
  await app.click(await find(/^按鈕 Restore$/))
  let result = 'none'
  for (let k = 0; k < 30; k++) {
    await sleep(150)
    const g = await grep(/Created \d|Failed|failed/)
    if (g) {
      result = g
      break
    }
  }
  await sleep(1500) // OBS-2:通知先於磁碟一致
  return result
}
/** 開 Paste & Restore → 讀預覽 →(選)切 Adjust 看另一種 →(選)勾覆蓋 → Restore。
 *  回傳 {first, toggled, disabledBefore, disabledAfterOverwrite, result, cancelled}。 */
globalThis.rsRun = async ({ toggleAdjust = false, overwrite = false, restore = true } = {}) => {
  for (let k = 0; k < 20 && (await grep(RS_STALE)); k++) {
    await sleep(500)
  } // 等上一案的通知消失,免得誤讀
  await app.click(await find(/^按鈕 Paste & Restore/))
  await sleep(1500)
  const first = await rsView()
  if (!first.open) {
    return { first, note: await note() }
  }
  let toggled = null
  if (toggleAdjust && first.adjust) {
    const cb = async () => (await lines()).find(([, t]) => t.startsWith('核取方塊 Adjust paths'))[0]
    await app.click(await cb())
    await sleep(700)
    toggled = await rsView()
    await app.click(await cb())
    await sleep(700)
  }
  const base = await rsView()
  const out = { first, toggled, disabledBefore: base.restoreDisabled }
  if (!restore) {
    await rsCancel()
    out.cancelled = true
    return out
  }
  if (overwrite) {
    const o = (await lines()).find(([, t]) => t.startsWith('核取方塊 Overwrite existing files'))
    if (o) {
      await app.click(o[0])
      await sleep(400)
    }
  }
  out.disabledAfterOverwrite = (await rsView()).restoreDisabled
  if (out.disabledAfterOverwrite) {
    await rsCancel()
    out.cancelled = true
    return out
  }
  out.result = await rsClickRestore()
  return out
}
export const rsResultIs = (r, text, label) =>
  check(
    r.result?.includes(text),
    `${label}: 通知實際 ${String(r.result).slice(0, 200)} 預期含 ${text}`
  )

// 單一 Create 項目、直接 Restore 的簡單案例共用
export const rsSimple = async (
  label,
  create,
  resultText = 'Created 1, overwritten 0, deleted 0, skipped 0.'
) => {
  await afterReset()
  const r = await rsRun()
  rsExpect(label, r.first, { Create: create })
  check(r.first.adjust === null, `${label}: 不該有 Adjust paths(實際 ${r.first.adjust?.label})`)
  rsResultIs(r, resultText, label)
  return r
}
