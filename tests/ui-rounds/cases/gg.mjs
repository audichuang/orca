// GG:Git Graph 編輯器分頁(feat/git-graph-tab-entry)。fixture 要先跑過 graph-fixture.sh。
const WEB = `${P}/WebApp`
const RE_TAB = /^sortable Git Graph Close tab$/
const RE_REPO = /^下拉式方塊 \(settable\) Description: Repository, Value: /
const RE_FILTER = /^下拉式方塊 \(settable\) Description: Branch filter, Value: /

const graphTabs = async () => (await findAll(RE_TAB)).length
const repoValue = async () => (await grep(RE_REPO)).replace(/^\d+ .*Value: /, '')
const filterValue = async () => (await grep(RE_FILTER)).replace(/^\d+ .*Value: /, '')
// 列文字依欄寬可能帶日期、hash 與 ", Value: 0"
const row = async (msgRe) => await find(new RegExp(`^切換鈕 (.* )?${msgRe.source}( |,|$)`))
const filesHeader = async () =>
  (await grep(/^文字 Changed files \(\d+\)/)).replace(/^\d+ 文字 /, '')
// 選單或下拉清單的項目,角色名不固定,取最後一個符合的
const pick = async (re) => {
  const ids = await findAll(re)
  check(ids.length > 0, `找不到 ${re}`)
  await app.click(ids.at(-1))
  await sleep(900)
}
// Repository 下拉:每個 repo 是一個 container 標題,底下列 worktree(例:container WebApp → main / feature/x)
const pickRepo = async (repo, worktree) => {
  await app.click(await find(RE_REPO))
  await sleep(900)
  const L = await lines()
  const g = L.findIndex(([, t]) => t === `container ${repo}`)
  check(g !== -1, `下拉沒有 ${repo} 群組`)
  for (let k = g + 1; k < L.length && !L[k][1].startsWith('container '); k++) {
    if (L[k][1].replace(/^\(selected\) /, '') === worktree) {
      await app.click(L[k][0])
      await sleep(1800)
      return
    }
  }
  throw new Error(`${repo} 群組下沒有 ${worktree}`)
}
const noCrash = async () =>
  check(!(await grep(/recoverable UI error/)), '出現 recoverable UI error')

// 回到乾淨狀態:關掉所有分頁,用快捷鍵開 Git Graph,切到 WebApp · main、feature/login
const freshGraph = async () => {
  await closeAll()
  await app.pressKey('cmd+shift+h')
  await sleep(2500)
  check((await graphTabs()) === 1, `快捷鍵後 Git Graph 分頁數 ${await graphTabs()}`)
  if (!/^WebApp · main$/.test(await repoValue())) {
    await pickRepo('WebApp', 'main')
  }
  if (!/feature\/login/.test(await filterValue())) {
    await app.click(await find(RE_FILTER))
    await sleep(900)
    await pick(/feature\/login$/)
    await app.pressKey('Escape')
    await sleep(600)
  }
}

defineCase('GG-01', {
  title: 'Cmd+Shift+H 開成編輯器分頁,再按一次不重複',
  run: async () => {
    await closeAll()
    check((await graphTabs()) === 0, '關閉後仍有 Git Graph 分頁')
    await app.pressKey('cmd+shift+h')
    await sleep(2500)
    check((await graphTabs()) === 1, `第一次:分頁數 ${await graphTabs()}`)
    check(!(await grep(/^container Orca hit|^標題 Open Git Graph$/)), '看起來是彈窗而非分頁')
    await app.pressKey('cmd+shift+h')
    await sleep(1500)
    check((await graphTabs()) === 1, `第二次:分頁數 ${await graphTabs()}`)
    return `1 個 Git Graph 分頁;Repository=${await repoValue()}`
  }
})

defineCase('GG-02', {
  title: 'Commits 收合時標題列的 Open Git Graph 可用,且不展開 Commits',
  run: async () => {
    await closeAll()
    const sidebarFilters = async () => (await findAll(/^下拉式方塊 .*Branch filter/)).length
    // 收合 Commits:展開時側欄會有 Branch filter 下拉
    if ((await sidebarFilters()) > 0) {
      await app.click(await find(/^按鈕 COMMITS/))
      await sleep(800)
    }
    check((await sidebarFilters()) === 0, 'Commits 收不起來')
    const btn = await btnAfter(/^按鈕 COMMITS/, /^按鈕 Open Git Graph$/, 3)
    await app.click(btn)
    await sleep(2500)
    check((await graphTabs()) === 1, `分頁數 ${await graphTabs()}`)
    // 分頁內的 Branch filter 是 1 個;側欄展開的話會變 2 個
    check(
      (await sidebarFilters()) === 1,
      `Branch filter 數 ${await sidebarFilters()}(Commits 被展開了?)`
    )
    return '收合狀態下標題列按鈕開出分頁,Commits 維持收合'
  }
})

defineCase('GG-03', {
  title: 'Repository 切換:WebApp → api-server → WebApp-feature → WebApp',
  run: async () => {
    await freshGraph()
    const seen = [await repoValue()]
    const go = async (repo, wt, rowRe) => {
      await pickRepo(repo, wt)
      const v = await repoValue()
      check(v === `${repo} · ${wt}`, `切換後 Repository=${v}`)
      if (rowRe) {
        check(Boolean(await grep(rowRe)), `${v} 的 commit 列找不到 ${rowRe}`)
      }
      seen.push(v)
    }
    const apiHead = sh(`git -C ${P}/api-server log -1 --format=%s`)
      .trim()
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    await go('api-server', 'main', new RegExp(`^切換鈕 (.* )?${apiHead}( |,|$)`))
    await go('WebApp', 'feature/x')
    await go('WebApp', 'main', /^切換鈕 (.* )?init/)
    return seen.join(' → ')
  }
})

defineCase('GG-04', {
  title: '多選兩個 commit → 開 diff → 回分頁仍是 2 commits',
  run: async () => {
    await freshGraph()
    await app.click(await row(/fix\(auth\): login redirect loop/))
    await sleep(800)
    await app.click(await row(/refactor\(auth\): rename remember to session/), { key: 'cmd' })
    await sleep(1200)
    checkRe(await filesHeader(), /^Changed files \(2\) · 2 commits$/, '多選後')
    await app.click(await find(/^按鈕 login\.tssrc\/auth/))
    await sleep(2500)
    check(Boolean(await grep(/^sortable login\.ts \(commit diff\)/)), '沒開出 login.ts diff 分頁')
    await app.click(await find(RE_TAB))
    await sleep(1500)
    checkRe(await filesHeader(), /^Changed files \(2\) · 2 commits$/, '回到 Git Graph 後')
    return '回來後仍是 Changed files (2) · 2 commits'
  }
})

defineCase('GG-05', {
  title: '多選右鍵 Copy commit hashes (2 commits) 複製兩個完整 SHA',
  run: async () => {
    await freshGraph()
    await app.click(await row(/fix\(auth\): login redirect loop/))
    await sleep(800)
    await app.click(await row(/refactor\(auth\): rename remember to session/), { key: 'cmd' })
    await sleep(1000)
    const expected = sh(`git -C ${WEB} rev-parse feature/login feature/login~1`).trim()
    const r = await copyAndRead(async () => {
      await app.click(await row(/fix\(auth\): login redirect loop/), { mouseButton: 'right' })
      await sleep(900)
      await pick(/Copy commit hashes \(2 commits\)/)
      return 'menu'
    })
    checkEq(r.clip?.trim(), expected, '剪貼簿')
    return r.clip
      .trim()
      .split('\n')
      .map((s) => s.slice(0, 7))
      .join(', ')
  }
})

defineCase('GG-06', {
  title: 'Alt+點擊檔案在 graph 右側開 diff,graph 仍在;再開沿用同一個右側群組',
  run: async () => {
    await freshGraph()
    await app.click(await row(/fix\(auth\): login redirect loop/))
    await sleep(800)
    await app.click(await row(/refactor\(auth\): rename remember to session/), { key: 'cmd' })
    await sleep(1000)
    // 每個編輯器群組一個 New tab 按鈕;Pane Actions 只在多群組時出現
    const groups = async () => (await findAll(/^彈出式按鈕 New tab$/)).length
    check((await groups()) === 1, `開始時群組數 ${await groups()}`)
    await app.click(await find(/^按鈕 login\.tssrc\/auth/), { key: 'alt' })
    await sleep(2500)
    check((await groups()) === 2, `Alt+點擊後群組數 ${await groups()}`)
    check(Boolean(await grep(RE_REPO)), 'Git Graph 不再可見')
    checkRe(await filesHeader(), /2 commits/, 'graph 的選取')
    await app.click(await find(/^按鈕 session\.tssrc\/auth/), { key: 'alt' })
    await sleep(2500)
    check((await groups()) === 2, `第二次 Alt+點擊後群組數 ${await groups()}`)
    check(Boolean(await grep(/^sortable session\.ts \(commit diff\)/)), '沒開出 session.ts diff')
    return '2 個群組:左 graph(仍 2 commits)、右 diff,第二次沿用右側'
  }
})

defineCase('GG-07', {
  title: 'B1:檔案 diff 來回後,init commit 的 Open all changes together 不 crash',
  run: async () => {
    await freshGraph()
    await app.click(await row(/fix\(auth\): login redirect loop/))
    await sleep(800)
    await app.click(await row(/refactor\(auth\): rename remember to session/), { key: 'cmd' })
    await sleep(1000)
    await app.click(await find(/^按鈕 login\.tssrc\/auth/))
    await sleep(2500)
    await app.click(await find(RE_TAB))
    await sleep(1200)
    await app.click(await find(/^按鈕 session\.tssrc\/auth/))
    await sleep(2500)
    await app.click(await find(RE_TAB))
    await sleep(1200)
    await app.click(await row(/init/))
    await sleep(1500)
    checkRe(await filesHeader(), /^Changed files \(8\)/, 'init 的檔案數')
    await app.click(await find(/Open all changes together/))
    await sleep(6000)
    await noCrash()
    const editors = (await findAll(/^editor/)).length
    check(editors >= 8, `combined diff 的 editor 數 ${editors}`)
    return `combined diff 載入,${editors} 個 editor,沒有 UI error`
  }
})

defineCase('GG-08', {
  title: '欄位對齊(兩側欄+分支樹+詳情 480;右側窄 split)',
  manual: '版面要看截圖,AX 讀不到欄位位置'
})
