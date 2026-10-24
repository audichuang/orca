// 測案腳本化的執行器。lcu 用法(lcu-orca.mjs 已載入、globalThis.app 已指派):
//   await import(`file://${ROUND.src}/tests/ui-rounds/case-runner.mjs?t=${Date.now()}`);
//   await import(`file://${ROUND.src}/tests/ui-rounds/cases/cc.mjs?t=${Date.now()}`);
//   nodeRepl.write(await runCases(['CC-01', 'CC-02']));   // 或 runCases('CC') 跑整組
// lcu 的沙箱:只能讀檔與跑唯讀指令;不能寫 ~ 底下、不能讀剪貼簿、不能連網、沒有 eval / node:process。
// 所以重置、pre 腳本、pbcopy、寫結果檔都由 Bash 做,這裡只做 UI 操作與唯讀斷言。
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'

// round.sh start 寫的這一輪設定:root(fixture 與 profile)、src(受測的 checkout)。
globalThis.ROUND = JSON.parse(
  fs.readFileSync(`${os.homedir()}/.cache/orca-ui-rounds/round.json`, 'utf8')
)
const UIR = `${ROUND.src}/tests/ui-rounds`
const CLIP = `${ROUND.root}/clip`
globalThis.P = `${ROUND.root}/MultiProduct`
globalThis.CASES ??= {}

// 一律用 bash 跑(使用者預設 shell 是 fish);只放唯讀指令
globalThis.sh = (cmd, { allowFail = false } = {}) => {
  try {
    return execFileSync('bash', ['-c', `P='${P}'; ROOT='${ROUND.root}'; UIR='${UIR}'; ${cmd}`], {
      encoding: 'utf8'
    })
  } catch (e) {
    if (allowFail) {
      return (e.stdout ?? '') + (e.stderr ?? '')
    }
    throw new Error(`sh failed: ${cmd}: ${String(e.stderr ?? e.message).slice(0, 200)}`)
  }
}

// 剪貼簿由 Bash 背景的 clipwatch.sh 寫到 <root>/clip/
const clipSeq = () => {
  try {
    return Number(fs.readFileSync(`${CLIP}/seq`, 'utf8'))
  } catch {
    return -1
  }
}
globalThis.clip = () => fs.readFileSync(`${CLIP}/latest.txt`, 'utf8')
/** 執行 action(回傳通知文字)並等剪貼簿變化;clip 沒變化時為 null(「No Git changes」不應改剪貼簿)。 */
globalThis.copyAndRead = async (action, timeoutMs = 3000) => {
  const before = clipSeq()
  check(before >= 0, `clipwatch.sh 沒在跑(${CLIP}/seq 不存在)`)
  const note = await action()
  for (let t = 0; t < timeoutMs; t += 150) {
    if (clipSeq() !== before) {
      await sleep(250)
      return { clip: clip(), note }
    }
    await sleep(150)
  }
  return { clip: null, note }
}
globalThis.statsOf = (text) =>
  execFileSync('python3', ['-I', `${UIR}/stats.py`], { input: text, encoding: 'utf8' }).trim()
/** 給人看內容的佐證截圖(Monaco 內文等 AX 讀不到的東西)。預設不拍以省 token;要看時先設 globalThis.EVIDENCE_SHOTS = true 再重跑該案例。 */
globalThis.evidenceShot = async () => {
  if (globalThis.EVIDENCE_SHOTS) {
    await app.getScreenshot()
  }
}
globalThis.q1 = async () => {
  await sleep(5000)
  return sh(`bash '${UIR}/q1.sh' '${ROUND.root}'`)
}

class CaseFail extends Error {}
globalThis.check = (cond, msg) => {
  if (!cond) {
    throw new CaseFail(msg)
  }
}
globalThis.checkEq = (actual, expected, label) => {
  check(actual !== null && actual !== undefined, `${label}: 沒有拿到內容`)
  if (actual === expected) {
    return
  }
  if (typeof expected !== 'string' || typeof actual !== 'string') {
    throw new CaseFail(`${label}: 實際 ${JSON.stringify(actual)} 預期 ${JSON.stringify(expected)}`)
  }
  const i = [...expected].findIndex((c, k) => actual[k] !== c)
  const at = i === -1 ? expected.length : i
  throw new CaseFail(
    `${label}: 第 ${at} 字起不同,實際 ${JSON.stringify(actual.slice(at, at + 40))} 預期 ${JSON.stringify(expected.slice(at, at + 40))}`
  )
}
globalThis.checkRe = (text, re, label) =>
  check(re.test(text ?? ''), `${label}: ${String(text).slice(0, 160)}`)

/** 註冊案例。
 *  run 回傳字串(實際看到什麼)即 PASS;check* 斷言失敗 → FAIL;其他例外 → BLOCKED。
 *  pre: 'reset'(這批開頭要先重置)或 'script'(Bash 要先跑 scripts/pre/<ID>.sh,runCases 的 ran 沒列到就不跑)。
 *  manual: 字串,需要人看畫面的原因;runner 只記 NOT-RUN。
 *  raw: true 時不先打開 MultiProduct(案例要測「剛啟動、還沒載入面板」的狀態)。 */
globalThis.defineCase = (
  id,
  { title, mutates = false, pre, manual, raw = false, e2eCovered, run }
) => {
  CASES[id] = { id, title, mutates, pre, manual, raw, e2eCovered, run }
}

/** 重置後的第一步:打開 MultiProduct 並確認 5 個 repo 都在。 */
globalThis.afterReset = async () => {
  await dismissToasts()
  await openMP()
  return await ensure5()
}

/** sel:ID 陣列或組別前綴。ran:這批 Bash 已經跑過 pre 腳本的案例(例:['CC-05'])。
 *  回傳每案一行 + 統計,由 Bash 端附加到結果檔。BLOCKED 時截圖,圖會以 blob-* 存在 tool-results。 */
globalThis.runCases = async (sel, { ran = [] } = {}) => {
  const ids = Array.isArray(sel) ? sel : Object.keys(CASES).filter((id) => id.startsWith(`${sel}-`))
  const out = []
  const tally = { PASS: 0, FAIL: 0, BLOCKED: 0, 'NOT-RUN': 0 }
  for (const id of ids) {
    const c = CASES[id]
    let line
    if (!c) {
      line = `${id} | NOT-RUN | 沒有這個案例的腳本 | -`
    } else if (c.manual) {
      line = `${id} | NOT-RUN | 需人工:${c.manual} | -`
    } else if (c.e2eCovered && !globalThis.RUN_E2E_COVERED) {
      line = `${id} | NOT-RUN | fork e2e 已涵蓋:${c.e2eCovered} | -`
    } else if (c.pre === 'script' && !ran.includes(id)) {
      line = `${id} | NOT-RUN | 需先跑 pre/${id}.sh | -`
    } else {
      try {
        // 前一案可能留在別的 workspace 或留下通知
        if (!c.raw) {
          await dismissToasts()
          await openMP()
        }
        line = `${id} | PASS | ${(await c.run()) ?? ''} | 腳本`
      } catch (e) {
        const status = e instanceof CaseFail ? 'FAIL' : 'BLOCKED'
        line = `${id} | ${status} | ${String(e.message).replace(/\n/g, ' ⏎ ').slice(0, 300)} | ${status === 'BLOCKED' ? '截圖' : '斷言'}`
        // FAIL 的訊息已寫明差異;只有腳本意外出錯才截圖
        if (status === 'BLOCKED') {
          try {
            await app.getScreenshot()
          } catch {}
        }
        try {
          await app.pressKey('Escape')
        } catch {}
      }
    }
    tally[line.split(' | ')[1]]++
    out.push(line)
  }
  out.push(
    Object.entries(tally)
      .map(([k, v]) => `${k} ${v}`)
      .join(' / ')
  )
  return out.join('\n')
}

/** 載入 cases/ 底下所有測案(*-actions.mjs 是各組共用的操作,由測案檔自己 import)。 */
globalThis.loadCases = async () => {
  const t = Date.now()
  for (const f of fs
    .readdirSync(`${UIR}/cases`)
    .filter((n) => n.endsWith('.mjs') && !n.endsWith('-actions.mjs'))
    .sort()) {
    await import(`file://${UIR}/cases/${f}?t=${t}`)
  }
  return `${Object.keys(CASES).length} cases`
}

nodeRepl.write('case-runner loaded')
