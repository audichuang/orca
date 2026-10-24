const {
  blocked,
  need,
  scWait,
  scStart,
  scSel,
  scCnt,
  scSec,
  scRowBtn,
  scHasRow,
  CH,
  ST,
  scSelected,
  scMainRow,
  scPanelTitle,
  scGoWs,
  scShell,
  scSettings,
  scSettingsBack,
  scAutoSave,
  scDeleteGroup,
  scCreateWorkspace
} = await import(
  new URL(`./sc-panel-actions.mjs${new URL(import.meta.url).search}`, import.meta.url).href
)

defineCase('SC-25.2', {
  title: '清理 many',
  pre: 'script',
  mutates: true,
  run: async () => {
    await openMP()
    await app.click(await find(/^按鈕 Refresh all repositories/))
    await sleep(3500)
    const c = await counts()
    check(!/按鈕 r\d\d /.test(c), `仍有 r?? 專案沒移除:${c}`)
    return 'r01–r20 已移除、many 資料夾已刪'
  }
})

defineCase('SC-26', {
  raw: true,
  title: '預設選取的競態',
  pre: 'script', // 重啟 Orca Dev(plan 會先單獨 getApp);pre 刻意不觸發 afterReset
  run: async () => {
    await app.click(await scMainRow('WebApp'))
    await sleep(2000)
    const sc = (await lines()).find(([, t]) => t.startsWith('按鈕 Source Control'))
    if (sc && !(await grep(/^按鈕 CHANGES \d/))) {
      await app.click(sc[0])
      await sleep(2000)
    }
    await sleep(3000)
    const webSc = await grep(/^按鈕 CHANGES \d/)
    need(webSc, 'WebApp main workspace 的 Source Control 沒有載入')
    await app.click(await find(/^text (Active|Inactive) MultiProduct$/))
    await sleep(2000)
    if (!(await grep(/^按鈕 Refresh all repositories/))) {
      const s2 = (await lines()).find(([, t]) => t.startsWith('按鈕 Source Control'))
      if (s2) {
        await app.click(s2[0])
      }
    }
    await sleep(4000)
    const sel = await scPanelTitle()
    checkRe(sel, /api-server/, '預設選取(應為清單第一個有變更的 api-server;選到 WebApp 即 SC-D6)')
    return `預設選取 ${sel}`
  }
})

defineCase('SC-27.1', {
  title: '記住選取:多個 folder workspace',
  pre: 'reset',
  mutates: true,
  run: async () => {
    await scStart()
    await scCreateWorkspace('MultiProduct', 'MultiProduct-2')
    check(await grep(/^text (Active|Inactive) MultiProduct-2$/), '沒有建出 MultiProduct-2')
    await scGoWs('MultiProduct')
    await scSel('WebApp')
    await scGoWs('MultiProduct-2')
    await sleep(1500)
    await scSel('docs-site')
    const out = []
    for (let k = 0; k < 3; k++) {
      await scGoWs('MultiProduct')
      const a = await scPanelTitle()
      checkRe(a, /WebApp/, `第 ${k + 1} 輪 MultiProduct 選取`)
      await scGoWs('MultiProduct-2')
      const b = await scPanelTitle()
      checkRe(b, /docs-site/, `第 ${k + 1} 輪 MultiProduct-2 選取`)
      out.push(`${a}|${b}`)
    }
    // 2. 在第二個雙擊開 diff,分頁不應出現在第一個
    await scGoWs('MultiProduct-2')
    await scSel('api-server')
    await app.click(await find(/^text server\.ts \+ 1 M/), { clickCount: 2 })
    await sleep(1500)
    check(await grep(/^sortable server\.ts/), 'MultiProduct-2 沒有開出 server.ts 分頁')
    await scGoWs('MultiProduct')
    check(!(await grep(/^sortable server\.ts/)), 'MultiProduct-2 開的分頁出現在 MultiProduct')
    return `3 輪來回各自保留(${out[0]});MultiProduct-2 的 server.ts 分頁不出現在 MultiProduct`
  }
})
defineCase('SC-27.2', {
  title: '重啟後回到預設;刪除第二個 folder workspace',
  pre: 'script',
  mutates: true, // 重啟 Orca Dev
  run: async () => {
    await scGoWs('MultiProduct')
    await sleep(3000)
    const sel = await scPanelTitle()
    // 清理:移除 MultiProduct-2(Remove Workspace 無確認對話框)
    await app.click(await find(/^text (Active|Inactive) MultiProduct-2$/), { mouseButton: 'right' })
    await sleep(800)
    const rm = await findAll(/^Remove Workspace/)
    need(rm.length, '右鍵選單找不到 Remove Workspace')
    await app.click(rm.at(-1))
    await sleep(1500)
    const b = (await lines()).find(([, t]) => /^按鈕 (Remove|Remove Workspace|Delete)$/.test(t))
    if (b) {
      await app.click(b[0])
      await sleep(1500)
    }
    check(!(await grep(/^text (Active|Inactive) MultiProduct-2$/)), 'MultiProduct-2 沒有被移除')
    return `重啟後第一個 workspace 選取 ${sel}(設計:記憶只存在記憶體,應回到預設 api-server);MultiProduct-2 已移除`
  }
})

defineCase('SC-28.1', {
  title: '右側欄關閉',
  pre: 'reset',
  mutates: true,
  run: async () => {
    await scStart()
    await app.click(await find(/^按鈕 Toggle right sidebar/))
    await sleep(800)
    check(!(await grep(/^按鈕 Refresh all repositories/)), '右側欄沒有關閉')
    return '右側欄已關閉(下一段改檔並等 30 秒)'
  }
})
defineCase('SC-28.2', {
  title: '重開右側欄後 3 秒內恢復刷新',
  pre: 'script',
  mutates: true, // pre 改 core/extra.ts 並等 30 秒
  run: async () => {
    await app.click(await find(/^按鈕 Toggle right sidebar/))
    const t0 = Date.now()
    const ok = await scWait(async () => (await scCnt('core')) === 3, 10000, 250)
    const secs = (Date.now() - t0) / 1000
    check(ok, `重開後 10 秒內 core 仍不是 3:${await counts()}`)
    check(secs <= 3.5, `core 2→3 花了 ${secs}s,超過 3 秒`)
    return `重開後 ${secs}s core 2→3`
  }
})

defineCase('SC-29', {
  title: '過濾時隱藏區段動作',
  pre: 'reset',
  run: async () => {
    await scStart()
    await scSel('WebApp')
    const ACT = /^按鈕 (Copy Full Source|Discard all|Stage all|Unstage all)$/
    const n0 = (await findAll(ACT)).length
    check(n0 > 0, '過濾前應有區段動作按鈕')
    await app.click(await find(/^按鈕 Filter files by name/))
    await sleep(700)
    await app.typeText('partial')
    await sleep(1200)
    const n1 = (await findAll(ACT)).length
    checkEq(n1, 0, '過濾中區段動作按鈕數')
    check(await grep(/^text partial\.ts/), '過濾後應有 partial.ts 列')
    check(!(await grep(/^text (unstaged-mod|staged-mod|README)\./)), '過濾後不應有其他檔案列')
    await app.pressKey('cmd+a')
    await app.pressKey('BackSpace')
    await sleep(1200)
    const n2 = (await findAll(ACT)).length
    checkEq(n2, n0, '清空後區段動作按鈕數')
    return `過濾前 ${n0} 個區段動作按鈕、過濾中 0 個(只剩 partial.ts 列)、清空後恢復 ${n2} 個`
  }
})

defineCase('SC-30.1', {
  title: '切換 repo 時 commit 草稿保留',
  pre: 'reset',
  mutates: true,
  run: async () => {
    await scStart()
    await scSel('core')
    await app.click(await scRowBtn(CH, /^text core\.ts/, /^按鈕 Stage$/))
    await sleep(1500)
    await app.setValue(await find(/^文字項目區域.*Commit message/), 'draft core')
    await sleep(500)
    await scSel('WebApp')
    await sleep(600)
    const web = await grep(/^文字項目區域.*Commit message/)
    check(!/Value: draft core/.test(web), `WebApp 的 message 應為空:${web}`)
    await scSel('core')
    await sleep(600)
    checkRe(await grep(/^文字項目區域.*Commit message/), /Value: draft core/, '回 core 的 message')
    return 'WebApp 的 message 空;回 core 仍 draft core(core.ts 已 stage,留給下一段)'
  }
})
defineCase('SC-30.2', {
  title: 'Commit blocked 卡片在切換 repo 後仍在',
  pre: 'script',
  mutates: true, // 只裝 hook,不重置
  run: async () => {
    await scSel('core')
    await app.click(await find(/^按鈕 Commit$/))
    await sleep(3500)
    const c0 = await grep(/Commit blocked/)
    checkRe(c0, /Commit blocked.*blocked by ui test hook/, '卡片')
    await scSel('WebApp')
    await scSel('core')
    await sleep(1200)
    checkRe(
      await grep(/Commit blocked|blocked by ui test hook/),
      /Commit blocked/,
      '切回 core 後卡片應仍在(SC-D8 已修)'
    )
    return '切到 WebApp 再切回 core,Commit blocked 卡片仍在'
  }
})
defineCase('SC-30.3', {
  title: '移除 hook(收尾)',
  pre: 'script',
  mutates: true,
  run: async () => {
    checkEq(
      scShell('test ! -e $P/libs/shared/core/.git/hooks/pre-commit && echo gone').trim(),
      'gone',
      'hook 已移除'
    )
    checkEq(
      scShell('git -C $P/libs/shared/core log -1 --format=%s').trim(),
      'init',
      'core 最新 commit 不應變'
    )
    return 'hook 已移除、core 仍為 init'
  }
})

defineCase('SC-31', {
  title: 'bulk action bar 的混合選取與清除',
  pre: 'reset',
  mutates: true,
  run: async () => {
    await scStart()
    await scSel('WebApp')
    const cmdClick = async (re) => {
      await app.click(await find(re), { key: 'cmd' })
    }
    const two = async () => {
      await cmdClick(/^text README\.md/)
      await cmdClick(/^text partial\.ts src/)
      await sleep(600)
    }
    // 1-2
    await cmdClick(/^text unstaged-mod\.ts src/)
    await cmdClick(/^text staged-mod\.ts src/)
    await sleep(700)
    const bar = await grep(
      /^text \d+ selected|^按鈕 (Stage|Unstage) \(\d\)|^按鈕 Copy Full Source$|^按鈕 Clear selection/
    )
    checkRe(bar, /2 selected/, '第 1 步 2 selected')
    checkRe(bar, /按鈕 Stage \(1\)/, '第 1 步 Stage (1)')
    checkRe(bar, /按鈕 Unstage \(1\)/, '第 1 步 Unstage (1)')
    checkRe(bar, /按鈕 Clear selection/, '第 1 步 Clear selection')
    const st0 = await scSec('STAGED CHANGES'),
      ch0 = await scSec('CHANGES')
    await app.click(await find(/^按鈕 Stage \(1\)/))
    await sleep(1800)
    checkEq(await scSec('STAGED CHANGES'), st0 + 1, '第 2 步 STAGED 數')
    checkEq(await scSec('CHANGES'), ch0 - 1, '第 2 步 CHANGES 數')
    check(await scHasRow(ST, /^text unstaged-mod\.ts src/), '第 2 步 unstaged-mod.ts 應進 STAGED')
    check(await scHasRow(ST, /^text staged-mod\.ts src/), '第 2 步 staged-mod.ts 應仍在 STAGED')
    // 3
    const clear = async () => {
      const c = await findAll(/^按鈕 Clear selection/)
      if (c.length) {
        await app.click(c[0])
        await sleep(400)
      }
    }
    await clear()
    await two()
    checkRe(await scSelected(), /2 selected/, '第 3 步選取前置')
    await app.pressKey('Escape')
    await sleep(500)
    checkEq(await scSelected(), 'none', '第 3 步 Esc 後')
    // 4
    await two()
    await app.click(await find(/^text logo\.png/), { mouseButton: 'right' })
    await sleep(900)
    const open = await scSelected()
    await app.pressKey('Escape')
    await sleep(900)
    const afterEsc = await scSelected()
    checkRe(open, /^1 selected/, '第 4 步右鍵當下')
    checkRe(afterEsc, /^1 selected/, '第 4 步 Esc 關選單後(應保留 1 selected)')
    await clear()
    // 5
    await two()
    checkRe(await scSelected(), /2 selected/, '第 5 步選取前置')
    await app.click(await find(/^editor|^按鈕 \/Users|^sortable Terminal/))
    await sleep(700)
    checkEq(await scSelected(), 'none', '第 5 步點編輯區後')
    return '操作列 Stage (1)/Unstage (1)/Clear;Stage 只動 unstaged-mod.ts;Esc 清空;右鍵未選列→1 selected 且 Esc 後保留;點編輯區清空'
  }
})

defineCase('SC-32', {
  title: '快捷鍵;非 git 資料夾不顯示 Source Control',
  pre: 'script', // 確認 $P/notes 存在
  run: async () => {
    await scStart()
    await app.click(await find(/^按鈕 Toggle right sidebar/))
    await sleep(800)
    check(!(await grep(/^按鈕 Explorer/)), '前置:右側欄沒有關閉')
    await app.click(await find(/^按鈕 \/Users|^editor|^sortable Terminal/))
    await app.pressKey('cmd+shift+g')
    await sleep(1200)
    check(
      await grep(/^按鈕 Refresh all repositories/),
      '第 1 步:Cmd+Shift+G 後右側欄沒有開在 Source Control'
    )
    try {
      await importFolder(`${ROUND.root}/MultiProduct/notes`)
      const o = (await lines()).find(([, t]) => t.startsWith('按鈕 Open as Folder'))
      if (!o) {
        blocked(
          `匯入 notes 沒有出現 Open as Folder:${await grep(
            /notes|not a git|Git|Add as|Open as|Initialize/i
          )}`
        )
      }
      await app.click(o[0])
      await sleep(2500)
      const tabs = await grep(/^按鈕 (Explorer|Agents|Source Control|Checks)/)
      check(
        !/Source Control/.test(tabs) && !/Checks/.test(tabs),
        `notes workspace 不應有 Source Control / Checks:${tabs}`
      )
      return `Cmd+Shift+G 開 Source Control;notes(非 git)的右側分頁:${tabs.replace(/\n/g, ' / ')}`
    } finally {
      try {
        await removeProj('notes')
      } catch {}
    }
  }
})

defineCase('SC-33', {
  title: 'folder 位於 repo 裡面時的提示',
  pre: 'reset',
  run: async () => {
    await scStart()
    const r = await importFolder(`${ROUND.root}/MultiProduct/WebApp/src`)
    const txt = r || (await grep(/already|inside|repository/i))
    const grp = (await lines()).find(([, t]) => t.startsWith('按鈕 Yes, import as group'))
    if (!grp) {
      await app.pressKey('Escape')
      blocked(
        `無法建立「位在 repo 裡面」的 folder workspace:${(txt || '').split('\n').slice(0, 3).join(' / ')}`
      )
    }
    // 若能建群組:建 workspace 後檢查提示(上游目前會解析成 WebApp repo,通常走不到這裡)
    await app.click(grp[0])
    await sleep(3000)
    await scCreateWorkspace('src', 'src')
    const notice = await grep(/This folder sits inside an imported repository/)
    checkRe(
      notice,
      /This folder sits inside an imported repository, so changes outside the folder are listed too\./,
      '提示文字'
    )
    return '能建立 folder workspace 且出現提示(需人工移除 src 專案/workspace)'
  }
})

defineCase('SC-34', {
  title: 'i18n(中文)',
  pre: 'reset',
  run: async () => {
    await scStart()
    let ok = false
    try {
      await scSettings('language')
      const dd = (await lines()).find(([, t]) => t.startsWith('下拉式方塊 (settable)'))
      need(dd, '設定頁找不到語言下拉')
      await app.click(dd[0])
      await sleep(800)
      const zh = (await lines()).find(([, t]) => /简体|簡體|Simplified|中文/.test(t))
      need(zh, '語言選單找不到簡體中文選項')
      await app.click(zh[0])
      await sleep(1500)
      ok = true
      await app.pressKey('Escape')
      await sleep(400) // 先關下拉
      const back = (await lines()).find(([, t]) => /^按鈕 (返回应用|Back to app)/.test(t)) // 設定頁要按返回才會離開
      if (back) {
        await app.click(back[0])
      }
      await sleep(1200)
      await sleep(1500) // 語言切換後不再用英文字串找 UI(openMP 的英文 regex 會失效),面板維持在原處
      const head = `${await grep(/刷新所有仓库/)}\n${await grep(/复制所有变更/)}\n${await grep(/粘贴并还原/)}`
      checkRe(head, /刷新所有仓库/, '標題列 刷新所有仓库')
      checkRe(head, /复制所有变更/, '標題列 复制所有变更')
      checkRe(head, /粘贴并还原/, '標題列 粘贴并还原')
      await scSel('WebApp')
      await app.click(await find(/^text partial\.ts src/), { key: 'cmd' })
      await app.click(await find(/^text unstaged-mod\.ts src/), { key: 'cmd' })
      await sleep(600)
      const bar = (await grep(/已选|選取|选择|^按鈕 (暂存|取消暂存|复制|清除)/)) || ''
      check(!/清除選取/.test(bar), `多選操作列仍有繁體「清除選取」:${bar}`)
      await app.click(await find(/^text README\.md/), { mouseButton: 'right' })
      await sleep(800)
      const menu = `${await grep(/在侧边打开/)}\n${await grep(/复制完整源码/)}`
      checkRe(menu, /在侧边打开/, '右鍵選單 在侧边打开')
      checkRe(menu, /复制完整源码/, '右鍵選單 复制完整源码')
      await app.pressKey('Escape')
      await sleep(400)
      await evidenceShot() // 英文殘留/繁體字串、× 的 tooltip 需人工看(SC-D9)
      return `簡體介面:標題列 刷新所有仓库/复制所有变更/粘贴并还原 OK;右鍵 在侧边打开/复制完整源码 OK;多選列 ${bar.replace(/\n/g, ' ').slice(0, 80)}。英文殘留與 × tooltip 需看截圖`
    } finally {
      if (ok) {
        try {
          await app.pressKey('Escape')
          await sleep(400)
          const s = (await lines()).find(([, t]) => /^按鈕 (设置|Settings)$/.test(t))
          await app.click(s[0])
          await sleep(1800)
          const f = (await lines()).find(([, t]) => t.startsWith('文字欄位 (settable)'))
          await app.setValue(f[0], '语言')
          await sleep(1000) // 介面已是簡體,英文 language 搜不到語言選項
          const d = (await lines()).find(([, t]) => t.startsWith('下拉式方塊 (settable)'))
          await app.click(d[0])
          await sleep(700)
          const sys = (await lines()).find(([, t]) =>
            /^(\(selected\) )?(System|系统|跟随系统)/.test(t)
          )
          await app.click(sys[0])
          await sleep(1500)
          await scSettingsBack()
        } catch {}
      }
    }
  }
})

defineCase('SC-35', {
  title: '單擊後 Cmd+點擊的選取數',
  pre: 'reset',
  run: async () => {
    await scStart()
    await scSel('WebApp')
    await app.click(await find(/^text partial\.ts src/))
    await sleep(700)
    await app.click(await find(/^text deleted-unstaged\.ts/), { key: 'cmd' })
    await sleep(700)
    const s3 = await scSelected()
    checkRe(s3, /^2 selected/, '第 3 步(單擊 + Cmd+點擊)')
    const c = await findAll(/^按鈕 Clear selection/)
    if (c.length) {
      await app.click(c[0])
      await sleep(400)
    }
    await app.click(await find(/^text partial\.ts src/), { key: 'cmd' })
    await app.click(await find(/^text deleted-unstaged\.ts/), { key: 'cmd' })
    await sleep(600)
    const s4 = await scSelected()
    checkRe(s4, /^2 selected/, '第 4 步(兩列都 Cmd+點擊)')
    const c2 = await findAll(/^按鈕 Clear selection/)
    if (c2.length) {
      await app.click(c2[0])
    }
    return `第 3 步「${s3}」、第 4 步「${s4}」`
  }
})

defineCase('SC-36', {
  title: '刷新中按 Refresh all 被吞掉',
  pre: 'reset',
  mutates: true,
  manual:
    '要在按 Refresh 後 1 秒內寫 $P/docs-site/index.md,但 lcu 不能寫檔、Bash 與 lcu 無法在 1 秒內交錯',
  run: async () => {}
})

// $HOME 在 lcu 裡取不到 process.env,用 sh 讀

// 除錯時可在 REPL 直接呼叫
Object.assign(globalThis, { scAutoSave, scDeleteGroup })
