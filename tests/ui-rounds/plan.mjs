#!/usr/bin/env node
// 排出一組測案的執行步驟:哪裡要 Bash 重置或跑 pre 腳本、哪些案例併成一次 lcu 呼叫。
// 用法:node plan.mjs <組別前綴|ID ...>    例:node plan.mjs CC    node plan.mjs SC-01 SC-02
import fs from 'node:fs'

const DIR = import.meta.dirname
const CASES = {}
// 案例檔頂層可能讀這些全域
const LOCK = `${process.env.HOME}/.cache/orca-ui-rounds/round.json`
globalThis.ROUND = fs.existsSync(LOCK)
  ? JSON.parse(fs.readFileSync(LOCK, 'utf8'))
  : { root: process.env.ORCA_UI_ROOT ?? `${process.env.HOME}/orca-ui-test`, src: `${DIR}/../..` }
globalThis.P = `${ROUND.root}/MultiProduct`
globalThis.CASES = CASES
globalThis.defineCase = (id, def) => {
  CASES[id] = { id, ...def }
}
// ed.js aliases this at top level; the real one lives in case-runner.js inside lcu.
globalThis.evidenceShot = async () => {}
for (const f of fs
  .readdirSync(`${DIR}/cases`)
  .filter((f) => f.endsWith('.mjs') && !f.endsWith('-actions.mjs'))
  .sort()) {
  await import(`${DIR}/cases/${f}`)
}

const args = process.argv.slice(2)
if (!args.length) {
  console.error('用法:node plan.mjs <組別前綴|ID ...>')
  process.exit(1)
}
const ids = args.flatMap((a) =>
  CASES[a] ? [a] : Object.keys(CASES).filter((id) => id.startsWith(`${a}-`))
)
// 分段案例(X、X.1、X.2、X.cleanup)排在一起依段數跑,不受案例檔載入順序影響
const stepOf = (id) => {
  const m = /\.(\d+|cleanup)$/.exec(id)
  return m ? (m[1] === 'cleanup' ? Infinity : Number(m[1])) : 0
}
const baseOf = (id) => id.replace(/\.(\d+|cleanup)$/, '')
const firstAt = new Map()
ids.forEach((id, i) => firstAt.has(baseOf(id)) || firstAt.set(baseOf(id), i))
ids.sort((a, b) => firstAt.get(baseOf(a)) - firstAt.get(baseOf(b)) || stepOf(a) - stepOf(b))
if (!ids.length) {
  console.error('沒有符合的案例')
  process.exit(1)
}

const preFile = (id) => `${DIR}/pre/${id}.sh`
const steps = []
let batch = null
let dirty = true // 不知道目前 fixture 狀態,先當髒的
const flush = () => {
  if (batch?.ids.length) {
    steps.push(batch)
  }
  batch = null
}
const open = ({ afterReset = false, getApp = false, ran = [] } = {}) => {
  flush()
  batch = { afterReset, getApp, ran, ids: [] }
}

for (const id of ids) {
  const c = CASES[id]
  if (c.manual) {
    ;(batch ??= { afterReset: false, getApp: false, ran: [], ids: [] }).ids.push(id)
    continue
  }
  if (c.pre === 'script') {
    const body = fs.existsSync(preFile(id)) ? fs.readFileSync(preFile(id), 'utf8') : ''
    flush()
    steps.push({ bash: `bash ${preFile(id)}`, missing: !body })
    // 只看實際呼叫:單行函式定義(例如 reset() { … reset-fixture.sh … })不算
    const calls = body
      .split('\n')
      .filter((l) => !/^\s*\w+\(\)\s*\{.*\}\s*$/.test(l))
      .join('\n')
    open({
      afterReset: /^\s*(reset_fixture|reset|ed_reset)\b/m.test(calls),
      getApp: /^\s*(app_stop|app_kill|ed_stop|ed_kill)\b/m.test(calls),
      ran: [id]
    })
    batch.ids.push(id)
    dirty = true
    continue
  }
  if (c.pre === 'reset' && dirty) {
    flush()
    steps.push({ bash: `bash ${DIR}/round.sh reset >/dev/null` })
    open({ afterReset: true })
    dirty = false
  }
  ;(batch ??= { afterReset: false, getApp: false, ran: [], ids: [] }).ids.push(id)
  if (c.mutates) {
    dirty = true
  }
}
flush()

const lcuCode = (b) =>
  [
    b.afterReset ? "nodeRepl.write(await afterReset() + '\\n');" : '',
    `nodeRepl.write(await runCases(${JSON.stringify(b.ids)}${b.ran.length ? `, { ran: ${JSON.stringify(b.ran)} }` : ''}));`
  ]
    .filter(Boolean)
    .join(' ')

steps.forEach((s, i) => {
  if (s.bash) {
    console.log(`${i + 1}. [Bash] ${s.bash}${s.missing ? '   ← pre 腳本不存在' : ''}`)
  } else {
    console.log(
      `${i + 1}. [lcu]${s.getApp ? ' (Orca 剛重啟:先單獨一次用 app 路徑 getApp)' : ''} ${lcuCode(s)}`
    )
  }
})
