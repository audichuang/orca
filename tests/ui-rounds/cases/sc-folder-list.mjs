const {
  esc,
  need,
  scWait,
  scStart,
  scSel,
  scCnt,
  scRowBtn,
  scDlg,
  scPanelTitle,
  scGoWs,
  scShell,
  scCloseOtherLocations,
  scOtherLocations,
  scDeleteGroup,
  scCreateWorkspace,
  UT
} = await import(
  new URL(`./sc-panel-actions.mjs${new URL(import.meta.url).search}`, import.meta.url).href
)

// =====================================================================================
// Notes
// =====================================================================================
defineCase('SC-18', {
  title: 'Notes 存在 repo 底下與送出後的行為',
  pre: 'reset',
  manual:
    '在 diff 行號旁 hover 出現的 + 要靠像素座標,且 Send notes → New agent 會直接以 notes 任務啟動真 agent(無預覽可改成 pwd 提示)',
  run: async () => {}
})

// =====================================================================================
// Folder 清單的邊界
// =====================================================================================
defineCase('SC-19.1', {
  title: 'WebApp 的 Other locations 設為 Hide',
  pre: 'reset',
  mutates: true,
  run: async () => {
    await scStart()
    const st = await scOtherLocations('WebApp', 'Hide')
    checkRe(st, /Other locations Hide/, 'Other locations 狀態')
    return `WebApp 專案 ${st.replace(/^\d+ /, '')}`
  }
})
defineCase('SC-19.2', {
  title: '隱藏 worktree 的提示',
  pre: 'script',
  mutates: true,
  run: async () => {
    const N = scShell('cat $ROOT/sc19-n.txt').trim()
    need(/^\d+$/.test(N), 'pre 沒有寫出 sc19-n.txt')
    await openMP()
    await app.click(await find(/^按鈕 Refresh all repositories/))
    await sleep(3500)
    const notice = 'Hidden worktrees under this folder are not included (1).'
    const g1 = (await grep(/Hidden worktrees under this folder are not included/)) || ''
    check(g1.includes(notice), `第 1 步沒有提示「${notice}」:${g1}`)
    check(!/WebApp-hidden/.test(await counts()), '清單不應有 WebApp-hidden')
    // 2. 複製全部變更
    const r = await copyAndRead(async () => {
      await app.click(await find(/^按鈕 Copy all changes$/))
      await sleep(250)
      const n1 = await grep(/not included|Git file\(s\)/)
      await sleep(1300)
      return n1
    })
    checkRe(
      r.note,
      /Hidden worktrees under this folder are not included \(1\)\./,
      '第 2 步先跳同句 info'
    )
    check(r.clip !== null, '第 2 步沒有複製到剪貼簿')
    checkEq(r.clip.split('WebApp-hidden/').length - 1, 0, "剪貼簿含 'WebApp-hidden/' 次數")
    // 3. 顯示隱藏的 worktree
    await app.click(await find(/^彈出式按鈕 Project actions for WebApp$/))
    await sleep(700)
    await app.click(await find(/^(Show hidden worktrees|Hide non-Orca worktrees)/))
    await sleep(1500)
    const sh =
      (await lines()).find(([, t]) => new RegExp(`^按鈕 Show hidden/x-${N}`).test(t)) ||
      (await lines()).find(([, t]) => t.startsWith('按鈕 Show hidden/x'))
    need(sh, `隱藏清單裡找不到 hidden/x-${N} 的 Show 按鈕`)
    await app.click(sh[0])
    await sleep(1200)
    await scCloseOtherLocations()
    await openMP()
    await app.click(await find(/^按鈕 Refresh all repositories/))
    await sleep(3500)
    const c = await counts()
    checkRe(
      c,
      /WebApp-hidden\S* \(hidden\/x[^)]*\) \d/,
      '第 3 步清單應出現 WebApp-hidden (hidden/x…)'
    )
    check(!(await grep(/Hidden worktrees under this folder are not included/)), '第 3 步提示應消失')
    return '提示出現且清單無 hidden;Copy all changes 先跳同句 info、剪貼簿無 WebApp-hidden/;顯示後清單出現 WebApp-hidden (hidden/x…)、提示消失'
  }
})
defineCase('SC-19.3', {
  title: '清理:Other locations 改回 Show',
  pre: 'script',
  mutates: true,
  run: async () => {
    await openMP()
    const st = await scOtherLocations('WebApp', 'Show')
    checkRe(st, /Other locations Show/, 'Other locations 狀態')
    return `worktree/分支已移除;WebApp 專案 ${st.replace(/^\d+ /, '')}`
  }
})

defineCase('SC-20', {
  title: '未匯入的 repo 不顯示;匯入後即時出現',
  pre: 'script',
  mutates: true,
  run: async () => {
    await scStart()
    const c0 = await counts()
    check(!/unimported/.test(c0), '匯入前清單不應有 unimported')
    check(c0.split('\n').length === 5, `匯入前應 5 列,實際 ${c0.split('\n').length}`)
    await importFolder(`${ROUND.root}/MultiProduct/unimported`)
    try {
      await sleep(1500)
      await openMP()
      await sleep(1500)
      const c = await scWait(async () => {
        const x = await counts()
        return /unimported \(main\) 1/.test(x) ? x : null
      }, 8000)
      check(c, `匯入後清單沒有 unimported (main) 1:${await counts()}`)
      const order = c.split('\n').map((l) => (l.match(/按鈕 (\S+) \(/) || [])[1])
      const iD = order.indexOf('docs-site'),
        iU = order.indexOf('unimported'),
        iW = order.indexOf('WebApp')
      check(iD < iU && iU < iW, `unimported 應排在 docs-site 與 WebApp 之間:${order.join(',')}`)
      return `匯入前 5 列、無 unimported;匯入後 unimported (main) 1,順序 ${order.join(' > ')}。註:匯入會自動切 workspace,「不切換就出現」無法驗證`
    } finally {
      try {
        await removeProj('unimported')
      } catch {}
    }
  }
})
defineCase('SC-20.2', {
  title: '清理 unimported',
  pre: 'script',
  mutates: true,
  run: async () => {
    await openMP()
    check(!/unimported/.test(await counts()), '清單仍有 unimported(Remove Project 沒成功)')
    return 'unimported 專案已移除、資料夾已刪'
  }
})

defineCase('SC-21', {
  title: '只有 1 個 / 0 個 repo 的 folder;repo 被移除',
  pre: 'script',
  mutates: true,
  run: async () => {
    await scStart()
    try {
      // 1. 以群組匯入 zero
      await importFolder(`${ROUND.root}/MultiProduct/zero`)
      const y = (await lines()).find(([, t]) => t.startsWith('按鈕 Yes, import as group'))
      need(y, '沒有「Yes, import as group」(zero 底下需有 2 個 repo)')
      await app.click(y[0])
      await sleep(3000)
      // 2. 群組列 Create workspace for zero
      await scCreateWorkspace('zero', 'zero')
      const sc = (await lines()).find(([, t]) => t.startsWith('按鈕 Source Control'))
      if (sc && !(await grep(/^按鈕 Refresh all repositories/))) {
        await app.click(sc[0])
        await sleep(1500)
      }
      await sleep(2500)
      const c2 = await counts()
      checkRe(c2, /duo \(main\) 0/, '第 2 步 duo')
      checkRe(c2, /solo \(main\) 1/, '第 2 步 solo')
      check(c2.split('\n').length === 2, `第 2 步應 2 列:${c2}`)
      checkRe(await scPanelTitle(), /solo/, '預設選取應為 solo')
      await scGoWs('MultiProduct')
      await app.click(await find(/^按鈕 Refresh all repositories/))
      await sleep(3500)
      const mp = await counts()
      checkRe(mp, /duo \(main\) 0/, 'MultiProduct 清單 duo')
      checkRe(mp, /solo \(main\) 1/, 'MultiProduct 清單 solo')
      // 3. 移除 duo
      await scGoWs('zero')
      await scSel('duo')
      await removeProj('duo')
      await sleep(1000)
      await scGoWs('zero')
      const c3 = await counts()
      check(c3.split('\n').length === 1 && /solo/.test(c3), `第 3 步後應只剩 solo:${c3}`)
      checkRe(await scPanelTitle(), /solo/, '第 3 步選取應落到 solo')
      // 4. 移除 solo
      await removeProj('solo')
      await sleep(1000)
      const z = (await lines()).find(([, t]) => /^text (Active|Inactive) zero/.test(t))
      let tail = 'zero workspace 隨群組消失'
      if (z) {
        await app.click(z[0])
        await sleep(1500)
        const msg = await grep(/No imported Git repositories under this folder/)
        checkRe(
          msg,
          /No imported Git repositories under this folder\. Add the repositories inside it to Orca to see their changes here\./,
          '第 4 步空狀態文字'
        )
        tail = 'workspace 仍在並顯示空狀態文字'
      }
      await evidenceShot()
      return `第 2 步 duo 0/solo 1、預設 solo、MultiProduct 清單同步;移除 duo 後落到 solo、剩 1 列;移除 solo 後 ${tail}`
    } finally {
      try {
        await scDeleteGroup('zero')
      } catch {}
    }
  }
})
defineCase('SC-21.2', {
  title: '清理 zero',
  pre: 'script',
  mutates: true,
  run: async () => {
    await openMP()
    check(!/duo|solo/.test(await counts()), 'MultiProduct 清單仍有 duo/solo')
    return 'zero 資料夾已刪'
  }
})

defineCase('SC-22', {
  title: '同名 repo 的標籤',
  pre: 'script',
  mutates: true,
  run: async () => {
    await scStart()
    await importFolder(`${ROUND.root}/MultiProduct/libs/other/core`)
    await openMP()
    await sleep(1500)
    await app.click(await find(/^按鈕 Refresh all repositories/))
    await sleep(3500)
    const c = await counts()
    checkRe(c, /other\/core \(main\)/, '清單 other/core')
    checkRe(c, /shared\/core \(main\)/, '清單 shared/core')
    check(!/按鈕 core \(main\)/.test(c), `不應有兩個(或單獨的)core (main):${c}`)
    const out = []
    // 手風琴展開後編號會位移,每次點之前重新找
    for (const want of ['other/core', 'shared/core']) {
      await app.click(await find(new RegExp(`^按鈕 ${esc(want)} \\(main\\)`)))
      await sleep(1200)
      const title = await scPanelTitle()
      check(title.includes(want), `選中 ${want} 後面板標題應含該標籤,實際「${title}」`)
      out.push(title)
    }
    return `清單 other/core (main) 與 shared/core (main),無重複 core (main);選中後面板標題 ${out.join(' / ')}`
  }
})
defineCase('SC-22.2', {
  title: '清理 other/core 專案',
  pre: 'script',
  mutates: true,
  run: async () => {
    // 左側欄兩個專案都叫 core,Remove 對話框也分不出;依加入順序取最後一個(other/core 最後匯入)。誤刪會在下面被偵測到。
    await openMP()
    const ids = await findAll(/^彈出式按鈕 Project actions for core$/)
    need(ids.length === 2, `左側欄應有 2 個 core 專案,實際 ${ids.length}`)
    await app.click(ids.at(-1))
    await sleep(700)
    await app.click(await find(/^Remove Project/))
    await sleep(1000)
    const c = (await lines()).filter(([, t]) => /^按鈕 Remove( Project)?$/.test(t))
    if (c.length) {
      await app.click(c.at(-1)[0])
      await sleep(1500)
    }
    await openMP()
    await app.click(await find(/^按鈕 Refresh all repositories/))
    await sleep(3500)
    const cnt = await counts()
    check(!/other\/core/.test(cnt), `other/core 仍在清單:${cnt}`)
    check(
      /按鈕 core \(main\) 2/.test(cnt),
      `shared/core 應仍在且為 core (main) 2(可能誤刪了 shared/core,需手動重新匯入 libs/shared/core):${cnt}`
    )
    return 'other/core 已移除、core (main) 2 仍在、libs/other 已刪'
  }
})

defineCase('SC-23', {
  title: 'repo 裡巢狀另一個已匯入 repo',
  pre: 'script',
  mutates: true,
  run: async () => {
    await scStart()
    await importFolder(`${ROUND.root}/MultiProduct/docs-site/plugins/inner`)
    try {
      await openMP()
      await sleep(1500)
      await app.click(await find(/^按鈕 Refresh all repositories/))
      await sleep(3500)
      checkEq(await scCnt('docs-site'), 2, '第 1 步 docs-site')
      checkEq(await scCnt('inner'), 1, '第 1 步 inner')
      // 2. 選 inner,點 index.md
      await scSel('inner')
      await app.click(await find(/^text index\.md/), { clickCount: 2 })
      await sleep(1800)
      check(await grep(/^sortable index\.md/), '第 2 步沒有 index.md 分頁')
      await evidenceShot() // 內容應為 +inner change
      // 3. 切到 docs-site 看 index.md 列(「目前開啟」高亮只是 CSS class,AX 讀不到)
      await scSel('docs-site')
      await sleep(600)
      await evidenceShot()
      // 4. 在編輯分頁(Source 模式)刪掉 inner change 並存檔
      await scSel('inner')
      const src = (await lines()).find(([, t]) => t.startsWith('圓形按鈕 Description: Source'))
      need(src, '找不到 Source 模式切換')
      await app.click(src[0])
      await sleep(1200)
      const ed = (await lines()).filter(([, t]) => t.startsWith('editor (settable)'))
      need(ed.length, '沒有編輯器')
      await app.click(ed.at(-1)[0])
      await app.pressKey('cmd+a')
      await app.typeText('inner\n')
      await app.pressKey('cmd+s')
      const t0 = Date.now()
      const ok = await scWait(async () => /inner \(main\) 0/.test(await counts()), 20000, 300)
      check(ok, `存檔後 inner 沒有在 20 秒內變 0:${await counts()}`)
      const sec = (Date.now() - t0) / 1000
      checkEq(await scCnt('docs-site'), 2, '第 4 步後 docs-site')
      // 5. docs-site 的 plugins/ 列刪除對話框(只看、Cancel)
      await scSel('docs-site')
      await app.click(await scRowBtn(UT, /^text inner plugins/, /^按鈕 Delete untracked file/))
      await sleep(1000)
      const d = await scDlg()
      need(d, '第 5 步沒有刪除對話框')
      const warns = /repo|repository|git/i.test(d.text)
      await app.click(await find(/^按鈕 Cancel$/))
      await sleep(500)
      return `docs-site 2/inner 1;存檔後 ${sec}s inner→0、docs-site 仍 2;刪除對話框「${d.title}」${warns ? '有' : '沒有'}提醒這是 repo。第 3 步「目前開啟」高亮不得出現在 docs-site 的 index.md:需看截圖人工確認`
    } finally {
      try {
        await removeProj('inner')
      } catch {}
    }
  }
})

defineCase('SC-24.1', {
  title: 'repo 從磁碟被外部刪除:刷新後面板',
  pre: 'script',
  mutates: true,
  run: async () => {
    await openMP()
    await app.click(await find(/^按鈕 Refresh all repositories/))
    await sleep(3500)
    const c = await counts()
    const d = (await lines()).find(([, t]) => t.startsWith('按鈕 docs-site ('))
    let doc = 'docs-site 列已消失'
    if (d) {
      await app.click(d[0])
      await sleep(1500)
      doc = `docs-site 列仍在:${d[1]}`
    }
    check(await grep(/^按鈕 Refresh all repositories/), '面板不見了(空白/當掉)')
    await evidenceShot()
    return `面板正常;${doc};清單 ${c
      .split('\n')
      .map((x) => x.replace(/^\d+ 按鈕 /, ''))
      .join(', ')}`
  }
})
defineCase('SC-24.2', {
  title: 'repo 被刪後其他 repo 仍持續刷新',
  pre: 'script',
  mutates: true,
  run: async () => {
    const t0 = Date.now()
    const ok = await scWait(async () => (await scCnt('core')) === 3, 30000, 500)
    check(ok, `core 沒有在 30 秒內 2→3:${await counts()}`)
    return `core 2→3 用了 ${(Date.now() - t0) / 1000}s(本步驟開始前已過 pre 的等待)`
  }
})

defineCase('SC-25', {
  title: '大量 repo 的捲動、版面、刷新時間',
  pre: 'script',
  mutates: true,
  run: async () => {
    await scStart()
    try {
      await app.click(await find(/^按鈕 Add project$/))
      await sleep(1200)
      await app.click(await find(/^按鈕 Browse folder/))
      await sleep(1500)
      await app.pressKey('cmd+shift+g')
      await sleep(800)
      await app.setValue(
        await find(/PathTextField|^文字欄位 \(settable\)/),
        `${ROUND.root}/MultiProduct/many`
      )
      await app.pressKey('Return')
      await sleep(1200)
      await app.click(await find(/^按鈕 打開/))
      await sleep(3000)
      const y = (await lines()).find(([, t]) => t.startsWith('按鈕 Yes, import as group'))
      need(y, '沒有「Yes, import as group」')
      await app.click(y[0])
      await sleep(5000)
      await scGoWs('MultiProduct')
      await app.click(await find(/^按鈕 Refresh all repositories/))
      const t0 = Date.now()
      const all = async () => {
        const c = (await lines()).filter(([, t]) => /^按鈕 r\d\d \(main\) \d/.test(t))
        return c.length === 20 && c.every(([, t]) => t.endsWith(' 1'))
      }
      const ok = await scWait(all, 60000, 500)
      const secs = (Date.now() - t0) / 1000
      check(ok, `20 個 r?? 沒有在 60 秒內都變 1`)
      await evidenceShot() // 清單高度(最多約 40%)、下方面板與 commit 按鈕需看截圖
      // 主按鈕依狀態顯示 Commit / Stage All / Sync 等,有任一個就代表 commit 區還在
      const commitBtn = await grep(
        /^按鈕 (\(disabled\) )?(Commit|Stage All|Sync|Push|Publish Branch)$/
      )
      check(commitBtn, '下方面板的 commit 主按鈕不見了')
      await app.click(await find(/^按鈕 api-server \(main\)/))
      await sleep(500)
      // 025c91a6f 起是標準手風琴:Home/End 只移焦點,Enter 才展開
      await app.pressKey('End')
      await app.pressKey('Return')
      await sleep(1000)
      const e = await scPanelTitle()
      await app.pressKey('Home')
      await app.pressKey('Return')
      await sleep(1000)
      const h = await scPanelTitle()
      await app.click(await find(/^按鈕 r20 \(main\)/))
      await sleep(1000)
      const r = await scPanelTitle()
      checkRe(e, /WebApp-feature|r20/, 'End 後選取')
      checkRe(h, /api-server/, 'Home 後選取')
      checkRe(r, /r20/, '點 r20 後選取')
      return `20 列都是 1,約 ${secs}s;End→${e}、Home→${h}、點 r20→${r};清單 40% 高度與可捲動需看截圖`
    } finally {
      try {
        await scDeleteGroup('many')
      } catch {}
      for (let i = 1; i <= 20; i++) {
        try {
          await removeProj(`r${String(i).padStart(2, '0')}`)
        } catch {}
      }
    }
  }
})
