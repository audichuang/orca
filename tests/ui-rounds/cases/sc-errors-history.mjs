const {
  need,
  scStart,
  scAllCnt,
  scRowId,
  scRowBtn,
  CH,
  scDlg,
  scConfirm,
  scMainRow,
  scShell,
  scPorcelain,
  scAgentDialog,
  scAgentObserve,
  scStopAgent
} = await import(
  new URL(`./sc-panel-actions.mjs${new URL(import.meta.url).search}`, import.meta.url).href
)

// =====================================================================================
// 失敗提示
// =====================================================================================
defineCase('SC-09.1', {
  title: 'Stage 失敗的 toast(index.lock)',
  pre: 'script',
  mutates: true,
  run: async () => {
    await scStart()
    await selectRepo('WebApp')
    await app.click(await scRowBtn(CH, /^text unstaged-mod\.ts src/, /^按鈕 Stage$/))
    await sleep(1500)
    const L = await lines()
    const i = L.findIndex(([, t]) => /Failed to stage/.test(t))
    need(i !== -1, '沒有出現 Failed to stage toast')
    const toast = L.slice(i, i + 4)
      .map((x) => x[1].replace(/^文字 /, ''))
      .join(' | ')
    checkRe(toast, /Failed to stage “src\/unstaged-mod\.ts”/, 'toast 標題')
    checkRe(toast, /index\.lock/, 'toast 描述應含 index.lock')
    checkRe(toast, /Retry/, 'toast 應有 Retry')
    return `toast:${toast.slice(0, 140)}。SC-D10 觀察:標題${/in WebApp/.test(toast) ? '有' : '沒有'}寫 repo 名稱`
  }
})
defineCase('SC-09.2', {
  title: '解鎖後按 Retry 成功 stage',
  pre: 'script',
  mutates: true,
  run: async () => {
    const r = await findAll(/^按鈕 Retry$/)
    let how = 'Retry'
    if (r.length) {
      await app.click(r[0])
      await sleep(2000)
    } else {
      // toast 已消失:改按 Stage 驗證解鎖後能 stage(Retry 本身未驗證)
      how = 'toast 已消失,改按 Stage(Retry 未驗證)'
      await app.click(await scRowBtn(CH, /^text unstaged-mod\.ts src/, /^按鈕 Stage$/))
      await sleep(2000)
    }
    check(
      await waitFor(
        () => /src\/unstaged-mod\.ts/.test(scShell('git -C $P/WebApp diff --cached --name-only')),
        6000
      ),
      'cached 不含 src/unstaged-mod.ts'
    )
    return `${how} → cached 含 src/unstaged-mod.ts`
  }
})
defineCase('SC-09.3', {
  title: 'Retry 只關 toast(換 workspace);lock 期間另一 worktree 照常 stage',
  pre: 'script',
  mutates: true,
  run: async () => {
    await app.click(await scRowBtn(CH, /^text README\.md/, /^按鈕 Stage$/))
    await sleep(1500)
    const failed = await grep(/Failed to stage/)
    need(failed, '第 4 步沒有出現 toast')
    await app.click(await scMainRow('api-server'))
    await sleep(1500)
    const rt = await findAll(/^按鈕 Retry$/)
    const hadRetry = rt.length > 0
    if (hadRetry) {
      await app.click(rt[0])
      await sleep(1500)
    }
    await openMP('MultiProduct')
    checkEq(
      /README\.md/.test(scShell('git -C $P/WebApp diff --cached --name-only')),
      false,
      '第 4 步 Retry 後 cached 不應含 README.md'
    )
    await selectRepo('WebApp-feature')
    await app.click(await scRowBtn(CH, /^text unstaged-mod\.ts src/, /^按鈕 Stage$/))
    await sleep(2000)
    check(
      await waitFor(
        () =>
          /src\/unstaged-mod\.ts/.test(
            scShell('git -C $P/WebApp-feature diff --cached --name-only')
          ),
        6000
      ),
      'WebApp-feature 在 lock 期間 stage 應成功'
    )
    return `${hadRetry ? '在 api-server workspace 按 Retry,只關 toast' : '切 workspace 後 toast 已消失(Retry 未驗證)'};README 未 stage;WebApp-feature stage 成功`
  }
})
defineCase('SC-09.4', {
  title: '清除 lock(收尾)',
  pre: 'script',
  mutates: true,
  run: async () => {
    checkEq(
      scShell('test ! -e $P/WebApp/.git/index.lock && echo gone').trim(),
      'gone',
      'index.lock 已移除'
    )
    return 'index.lock 已移除'
  }
})

defineCase('SC-10', {
  title: 'Commit 被 hook 擋下的卡片與 AI 修復的 cwd',
  pre: 'script',
  mutates: true,
  run: async () => {
    await scStart()
    await selectRepo('core')
    await app.click(await scRowBtn(CH, /^text core\.ts/, /^按鈕 Stage$/))
    await sleep(1500)
    await app.click(await find(/^文字項目區域 .*Commit message/))
    await app.pressKey('cmd+a')
    await app.typeText('hook test')
    await sleep(300)
    await app.click(await find(/^按鈕 Commit$/))
    await sleep(3500)
    const card = await grep(/Commit blocked/)
    checkRe(card, /Commit blocked.*blocked by ui test hook/, 'Commit blocked 卡片')
    checkEq(
      scShell('git -C $P/libs/shared/core log -1 --format=%s').trim(),
      'init',
      'core 最新 commit'
    )
    const hasAiFix = await grep(/Fix commit failure with AI/)
    need(hasAiFix, '卡片沒有 AI Fix(BLOCKED)')
    await app.click(await find(/^彈出式按鈕 .*Choose agent to fix commit failure/))
    await sleep(1200)
    await app.click(await find(/^Customize launch/))
    await sleep(1500)
    const d = await scDlg()
    checkRe(d && d.title, /Fix Commit Failure With AI/, '對話框標題')
    await scAgentDialog()
    const o = await scAgentObserve('MultiProduct')
    try {
      check(o.tabs, '沒有新的 Terminal 分頁')
      check(o.active, '左側欄跳離了 MultiProduct workspace')
      if (o.acc) {
        checkRe(o.acc, /\/MultiProduct\/libs\/shared\/core/, '信任提示的 cwd')
      }
      return `卡片+hook 訊息 OK、log 仍 init;agent 分頁開在 MultiProduct(左側欄未跳);cwd ${o.acc ? `=${o.acc.slice(-60)}` : '需人工確認(信任提示不在 AX,看截圖/終端機 shell 提示字元應為 core)'}`
    } finally {
      await evidenceShot()
      await scStopAgent()
    }
  }
})
defineCase('SC-10.2', {
  title: '移除 pre-commit hook(收尾)',
  pre: 'script',
  mutates: true,
  run: async () => {
    checkEq(
      scShell('test ! -e $P/libs/shared/core/.git/hooks/pre-commit && echo gone').trim(),
      'gone',
      'hook 已移除'
    )
    return 'hook 已移除'
  }
})

defineCase('SC-11', {
  title: 'Push 被拒的提示(只按 Push)',
  pre: 'reset',
  run: async () => {
    await scStart()
    await selectRepo('api-server')
    await app.click(await find(/^彈出式按鈕 More commit and remote actions/))
    await sleep(800)
    const push = (await lines()).find(([, t]) => /^Push \(\d+\)$/.test(t))
    need(push, '選單找不到 Push (N)')
    await app.click(push[0])
    await sleep(4000)
    const msg = await grep(/Push rejected|Push blocked|Push failed/)
    checkRe(msg, /Push rejected — remote has changes\. Pull first, then try again\./, '提示文字')
    checkRe(
      scShell('git -C $P/api-server status -sb | head -1'),
      /ahead 2, behind 1/,
      'api-server 狀態'
    )
    const hasAi = await grep(/Choose agent to fix push failure/)
    return `提示「Push rejected — remote has changes. Pull first, then try again.」;仍 ahead 2, behind 1;${hasAi ? '有 Choose agent(cwd 子步驟需人工)' : '無 Push blocked 卡片與 AI 入口,cwd 子步驟 NOT-RUN'}`
  }
})

// =====================================================================================
// 歷史
// =====================================================================================
defineCase('SC-12', {
  title: '子 repo 的 COMMITTED ON BRANCH',
  pre: 'reset',
  run: async () => {
    await scStart()
    await selectRepo('api-server')
    const COB = /^按鈕 COMMITTED ON BRANCH/
    need(await grep(COB), '沒有 Committed on Branch 區段(請改看 Change Base Ref… 的目前 base)')
    await app.click(await scRowId(COB, /^text server\.ts \+ 2 M/), { clickCount: 2 })
    await sleep(2000)
    const tab1 = await grep(/^sortable server\.ts/)
    check(tab1, '雙擊後沒有 server.ts 分頁')
    checkRe(tab1, /branch diff/, '分頁應為 branch diff')
    check(await grep(/^text Active MultiProduct$/), '左側欄離開了 MultiProduct')
    await evidenceShot()
    const n0 = (await findAll(/^sortable server\.ts/)).length
    await app.click(await scRowId(COB, /^text server\.ts \+ 2 M/), { mouseButton: 'right' })
    await sleep(700)
    await app.click(await find(/^Open to the Side/))
    await sleep(1500)
    const n1 = (await findAll(/^sortable server\.ts/)).length
    await app.click(await btnAfter(COB, /^按鈕 View all/))
    await sleep(2500)
    const va = await grep(/^sortable Branch Changes|changed files/)
    checkRe(va, /Branch Changes/, 'View all 分頁')
    checkRe(va, /1 changed files/, 'View all 只含 api-server 的檔(1 個)')
    return `列 server.ts(+2 即 local 1/2,不含 unstaged api);branch diff 分頁在 folder;Open to the Side 後 server.ts 分頁 ${n0}→${n1}(分割需看截圖);View all 為 Branch Changes、1 changed files。diff 內文需看截圖`
  }
})

defineCase('SC-13', {
  title: '子 repo 的 Commits 歷史',
  pre: 'reset',
  run: async () => {
    await scStart()
    await closeAll()
    await selectRepo('api-server')
    const SHOWHIDE = /^按鈕 (Show|Hide) files in commit [0-9a-f]+: /
    if (!(await grep(SHOWHIDE))) {
      await clickRe(/^按鈕 COMMITS( \d+)?$/)
      await sleep(1500)
    }
    const rows = (await lines()).filter(([, t]) => SHOWHIDE.test(t)).map((x) => x[1])
    check(rows.length === 3, `api-server Commits 應有 3 筆,實際 ${rows.length}`)
    // 2. 展開 local-2,雙擊 server.ts
    const row2 = /^按鈕 (Show|Hide) files in commit [0-9a-f]+: local-2/
    if ((await lines()).find(([, t]) => row2.test(t))[1].startsWith('按鈕 Show')) {
      await clickRe(row2)
    }
    await sleep(800)
    await app.click(await find(/^按鈕 server\.ts \w, Help: server\.ts/), { clickCount: 2 })
    await sleep(2000)
    check(await grep(/^sortable server\.ts/), '第 2 步沒有 commit diff 分頁')
    const openFile = await grep(/Open file/)
    if (openFile) {
      checkRe(openFile, /disabled/, '第 2 步 Open file 應停用')
    }
    // 3. Open all changes together
    await app.click(await find(/^按鈕 Open all changes together/))
    await sleep(2000)
    const t3 = await grep(/^sortable Commit [0-9a-f]+: local-2/)
    check(t3, '第 3 步分頁標題應為 Commit <hash>: local-2')
    // 4. Copy commit hash
    const head = scShell('git -C $P/api-server rev-parse HEAD').trim()
    const r4 = await copyAndRead(async () => {
      await app.click(await find(row2), { mouseButton: 'right' })
      await sleep(800)
      await app.click(await find(/^Copy commit hash/))
      await sleep(500)
      return await grep(/Commit hash copied/)
    })
    checkRe(r4.note, /Commit hash copied/, '第 4 步通知')
    checkEq((r4.clip ?? '').trim(), head, '第 4 步剪貼簿 = rev-parse HEAD')
    // 5. Open commit in browser
    await app.click(await find(row2), { mouseButton: 'right' })
    await sleep(700)
    await app.click(await find(/^Open commit in browser/))
    await sleep(500)
    checkRe(
      await grep(/web remote|supported/),
      /This repository has no supported web remote/,
      '第 5 步通知'
    )
    // 6. 展開 base,雙擊 README.md(通知浮在右下角會蓋住這一列,先關掉)
    await dismissToasts()
    await clickRe(/^按鈕 Show files in commit [0-9a-f]+: base/)
    await sleep(800)
    await dblOpen(/^按鈕 README\.md \w, Help: README\.md/, /^sortable README/)
    const nApi = (await findAll(/^sortable README/)).length
    check(nApi >= 1, '第 6 步沒有 README 分頁')
    // 7. WebApp 的 init README
    await selectRepo('WebApp')
    if (!(await grep(/^按鈕 (Show|Hide) files in commit [0-9a-f]+: init/))) {
      await clickRe(/^按鈕 COMMITS( \d+)?$/)
      await sleep(1500)
    }
    if (
      (await lines())
        .find(([, t]) => /^按鈕 (Show|Hide) files in commit [0-9a-f]+: init/.test(t))[1]
        .startsWith('按鈕 Show')
    ) {
      await clickRe(/^按鈕 Show files in commit [0-9a-f]+: init/)
    }
    await sleep(800)
    for (let k = 0; k < 2 && (await findAll(/^sortable README/)).length === nApi; k++) {
      await app.click(await find(/^按鈕 README\.md \w, Help: README\.md/), { clickCount: 2 })
      await sleep(1800)
    }
    const nBoth = (await findAll(/^sortable README/)).length
    check(
      nBoth === nApi + 1,
      `第 7 步應多一個 README 分頁(兩個 repo 各一個),分頁數 ${nApi}→${nBoth}`
    )
    await evidenceShot()
    // 8. core
    await selectRepo('core')
    if (!(await grep(SHOWHIDE))) {
      await clickRe(/^按鈕 COMMITS( \d+)?$/)
      await sleep(1500)
    }
    const coreRows = (await lines()).filter(([, t]) => SHOWHIDE.test(t)).map((x) => x[1])
    check(
      coreRows.length === 1 && /: init/.test(coreRows[0]),
      `core 的 Commits 應只有 init:${coreRows.join(' / ')}`
    )
    return `3 筆 commits;commit diff/Open all 分頁 OK;Copy hash = ${head.slice(0, 7)}…;browser 通知 OK;兩個 repo 各有 README 分頁;core 只有 init。diff 內文(local 2、# api/base 等)需看截圖`
  }
})

defineCase('SC-14', {
  title: 'Explain changes 的 cwd',
  pre: 'reset',
  mutates: true, // 會啟動 agent
  run: async () => {
    await scStart()
    await selectRepo('api-server')
    const row2 = /^按鈕 (Show|Hide) files in commit [0-9a-f]+: local-2/
    if (!(await grep(row2))) {
      await clickRe(/^按鈕 COMMITS( \d+)?$/)
      await sleep(1800)
    }
    await app.click(await find(row2), { mouseButton: 'right' })
    await sleep(800)
    await app.click(await find(/^Explain changes/))
    await sleep(3000)
    const dlg = await scDlg()
    const o = await scAgentObserve('MultiProduct')
    try {
      check(o.tabs, `沒有新的 Terminal 分頁${dlg ? `(出現對話框:${dlg.title})` : ''}`)
      check(o.active, '左側欄跳離了 MultiProduct')
      check(!(await grep(/not a git repository/)), '出現 not a git repository')
      if (o.acc) {
        checkRe(o.acc, /\/api-server/, '信任提示 cwd')
      }
      return `agent 分頁開在 MultiProduct、無 not a git repository;cwd ${o.acc ? `=${o.acc.slice(-50)}` : '需人工確認(信任提示不在 AX,看截圖)'};未按信任並已 Ctrl+C`
    } finally {
      await evidenceShot()
      await scStopAgent()
    }
  }
})

defineCase('SC-16', {
  title: '子 repo 的 merge conflict:agent cwd 與 Abort',
  pre: 'script',
  mutates: true,
  run: async () => {
    await scStart()
    const before = await scAllCnt()
    await selectRepo('docs-site')
    need(
      await grep(/Resolve with AI/),
      '沒有 Merge conflicts 卡片 / Resolve with AI(pre 腳本是否成功?)'
    )
    await app.click(await find(/Resolve with AI/))
    await sleep(3000)
    const d = await scDlg()
    checkRe(d && d.title, /Resolve Conflicts With AI/, '對話框標題')
    await scAgentDialog()
    const o = await scAgentObserve('MultiProduct')
    try {
      check(o.tabs, '沒有新的 Terminal 分頁')
      check(o.active, '左側欄跳離了 MultiProduct')
      if (o.acc) {
        checkRe(o.acc, /\/docs-site/, '信任提示 cwd')
      }
    } finally {
      await evidenceShot()
      await scStopAgent()
    }
    await selectRepo('docs-site')
    await app.click(await find(/^按鈕 Abort merge/))
    await sleep(1000)
    const d2 = await scDlg()
    need(d2, 'Abort merge 沒有確認對話框')
    await scConfirm(/^按鈕 Abort( merge)?$/, 3000)
    check(
      await waitFor(() => scPorcelain('$P/docs-site').trim() === ''),
      `docs-site status 應為空:${scPorcelain('$P/docs-site')}`
    )
    checkEq(
      scShell('test ! -e $P/docs-site/.git/MERGE_HEAD && echo gone').trim(),
      'gone',
      'MERGE_HEAD'
    )
    const after = await scAllCnt()
    for (const r of REPOS) {
      if (r !== 'docs-site') {
        checkEq(after[r], before[r], `其他 repo ${r}`)
      }
    }
    return `Resolve 對話框「${d.title}」、agent 分頁在 MultiProduct、cwd ${o.acc ? `=${o.acc.slice(-40)}` : '需人工確認(看截圖)'};Abort 「${d2.title}」後 status 空、無 MERGE_HEAD、其他 repo 不變`
  }
})
