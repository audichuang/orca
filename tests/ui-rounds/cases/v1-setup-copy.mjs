const {
  V1_EXPECT_COUNTS,
  v1Start,
  v1Rows,
  v1CountsMap,
  v1WaitUntil,
  v1Panel,
  v1Select,
  v1Tree,
  v1Sig,
  v1RowIn,
  v1BtnAfterId,
  SEC_CH,
  SEC_ST,
  v1Panes,
  v1Tabs,
  v1HeaderRepo,
  v1ContentCheck,
  v1MainRow
} = await import(
  new URL(`./v1-panel-actions.mjs${new URL(import.meta.url).search}`, import.meta.url).href
)

defineCase('V1-P1', {
  title: '匯入的群組與專案存在',
  run: async () => {
    check(
      (await findAll(/^彈出式按鈕 Group actions for MultiProduct$/)).length === 1,
      '左側欄沒有 MultiProduct 群組(需先人工匯入:Add project → Browse folder → Yes, import as group)'
    )
    for (const p of ['api-server', 'docs-site', 'WebApp', 'core']) {
      check(
        (await findAll(new RegExp(`^彈出式按鈕 Project actions for ${p}$`))).length === 1,
        `左側欄沒有專案 ${p}`
      )
    }
    check(
      (await findAll(/^彈出式按鈕 Project actions for notes$/)).length === 0,
      'notes 不該被當成專案'
    )
    const hid = await grep(/Hiding \d+ discovered worktree/)
    return `群組與 4 個專案都在,沒有 notes${hid ? `;注意 WebApp 仍有隱藏 worktree(${hid.replace(/^\d+ /, '')})` : ''}`
  }
})

defineCase('V1-P2', {
  title: 'folder workspace 存在且可選取',
  run: async () => {
    const id = await find(/^text (Active|Inactive) MultiProduct$/)
    await app.click(id)
    await sleep(1500)
    check(
      (await grep(/^按鈕 Source Control/)) !== '',
      '點 MultiProduct workspace 後右側欄沒有 Source Control 分頁'
    )
    return '左側欄有 MultiProduct folder workspace,點進去後右側欄正常'
  }
})

defineCase('V1-P3', {
  title: 'Source Control 分頁出現,沒有 Checks',
  run: async () => {
    await v1Start()
    check((await findAll(/^按鈕 Source Control/)).length === 1, '沒有 Source Control 分頁')
    check((await findAll(/^按鈕 Checks$/)).length === 0, '不該出現 Checks 分頁')
    const pr = (await findAll(/^按鈕 PR Checks$/)).length
    await clickRe(/^按鈕 Source Control/)
    check(
      (await grep(/^按鈕 Refresh all repositories/)) !== '',
      '點 Source Control 後沒有 folder 面板(Refresh all repositories)'
    )
    return `有 Source Control、沒有 Checks;PR Checks 分頁 ${pr ? '存在(上游 folder 專用,不算 Checks)' : '不存在'}`
  }
})

// ---------- A:repo 清單與版面 ----------
defineCase('V1-A1', {
  title: '清單內容',
  pre: 'reset',
  run: async () => {
    await v1Start()
    await ensure5()
    const rows = await v1Rows()
    checkEq(
      rows.map((r) => `${r.name} (${r.branch})`).join(', '),
      'api-server (main), core (main), docs-site (main), WebApp (main), WebApp-feature (feature/x)',
      '清單列'
    )
    check((await grep(/^按鈕 notes /)) === '', 'notes 不該在清單')
    return '5 列順序與大小寫正確,沒有 notes'
  }
})

defineCase('V1-A2', {
  title: '數字與 ↓↑',
  pre: 'reset',
  run: async () => {
    await v1Start()
    let m = await v1WaitUntil(async () => {
      const c = await v1CountsMap()
      return JSON.stringify(c) === JSON.stringify(V1_EXPECT_COUNTS) ? c : null
    }, 12000)
    if (!m) {
      await clickRe(/^按鈕 Refresh all repositories/)
      await sleep(3500)
      m = await v1CountsMap()
    }
    checkEq(JSON.stringify(m), JSON.stringify(V1_EXPECT_COUNTS), '各 repo 變更數')
    // 每列後(到下一列之前)的 ↓↑ 文字:只有 api-server 有
    const L = await lines()
    const rows = await v1Rows()
    const arrows = {}
    rows.forEach((r, k) => {
      const from = L.findIndex(([n]) => n === r.id)
      const to = k + 1 < rows.length ? L.findIndex(([n]) => n === rows[k + 1].id) : from + 8
      arrows[r.name] = L.slice(from, to)
        .map(([, t]) => t)
        .filter((t) => /[↓↑]/.test(t))
        .join('')
    })
    checkRe(arrows['api-server'], /↓1\s+↑2/, 'api-server 的 ↓↑')
    for (const n of ['core', 'docs-site', 'WebApp', 'WebApp-feature']) {
      checkEq(arrows[n], '', `${n} 不該有 ↓↑`)
    }
    return '2/2/0/10/1,只有 api-server ↓1 ↑2'
  }
})

defineCase('V1-A3', {
  raw: true,
  title: '預設選取(需在本次 Orca 啟動後尚未選過任何 repo)',
  pre: 'reset',
  run: async () => {
    await v1Start()
    const p = await v1Panel()
    checkEq(
      p,
      'api-server (main)',
      '預設選取的面板標題(若本批前面已選過別的 repo,需重啟 Orca 後單獨跑;選中底色與指示條需眼看)'
    )
    return '面板標題 api-server (main)'
  }
})

defineCase('V1-A4', {
  title: '切換 repo 與版面',
  pre: 'reset',
  run: async () => {
    await v1Start()
    await v1Select('WebApp')
    const rows = await v1Rows()
    checkEq(rows.length, 5, '上方清單仍可見的列數')
    const t = await v1Tree()
    checkEq(t['CHANGES']?.n, 5, 'WebApp 面板 CHANGES')
    return '面板換成 WebApp (main),清單 5 列仍在,面板有 CHANGES 5(「無大片空白」需眼看)'
  }
})

defineCase('V1-A5', {
  title: '重新整理不跳選取',
  pre: 'reset',
  run: async () => {
    await v1Start()
    await v1Select('WebApp')
    await clickRe(/^按鈕 Refresh all repositories/)
    await sleep(3500)
    checkEq(await v1Panel(), 'WebApp (main)', 'Refresh all 後面板標題')
    return 'Refresh all 後仍是 WebApp (main)'
  }
})

defineCase('V1-A6', {
  title: '切換 workspace 來回後記住選取',
  pre: 'reset',
  run: async () => {
    await v1Start()
    await v1Select('WebApp')
    await app.click(await v1MainRow('api-server'))
    await sleep(2000)
    check(
      (await grep(/^按鈕 Refresh all repositories/)) === '',
      '切到 api-server workspace 後仍顯示 folder 面板'
    )
    await v1Start()
    await sleep(1500)
    checkEq(await v1Panel(), 'WebApp (main)', '切回 MultiProduct 後面板標題')
    return '切到 api-server workspace 再切回,仍選 WebApp (main)'
  }
})

defineCase('V1-A7', {
  // 025c91a6f 起 repo 清單是標準手風琴:方向鍵/Home/End 只移焦點,Enter/Space 展開或收合焦點那一列
  title: '鍵盤操作(手風琴:方向鍵/Home/End 移焦點,Enter/Space 展開或收合)',
  pre: 'reset',
  run: async () => {
    await v1Start()
    await v1Select('api-server')
    const seq = [
      ['Down', 'api-server (main)'],
      ['Return', 'core (main)'],
      ['End', 'core (main)'],
      ['Return', 'WebApp-feature (feature/x)'],
      ['Home', 'WebApp-feature (feature/x)'],
      ['Return', 'api-server (main)']
    ]
    const got = []
    for (const [k, want] of seq) {
      await app.pressKey(k)
      await sleep(600)
      const p = await v1Panel()
      got.push(`${k}→${p}`)
      checkEq(p, want, `按 ${k} 後展開的 repo`)
    }
    // 再按一次 Space 收合目前展開的那一列,再按一次展開回來
    await app.pressKey('space')
    await sleep(600)
    const closed = await v1Panel()
    check(closed !== 'api-server (main)', `Space 應收合 api-server,實際仍是 ${closed}`)
    await app.pressKey('space')
    await sleep(600)
    checkEq(await v1Panel(), 'api-server (main)', 'Space 再按一次應展開回 api-server')
    return `${got.join(' ; ')} ; space→${closed} ; space→api-server(焦點框外觀需眼看)`
  }
})

defineCase('V1-A8', {
  title: '複製鈕不被遮擋(逐列點得到)',
  pre: 'reset',
  run: async () => {
    await v1Start()
    const rows = await v1Rows()
    for (const r of rows) {
      const b = await v1BtnAfterId(r.id, /^按鈕 Copy all changes$/)
      check(b, `${r.name} 列沒有複製鈕`)
    }
    const n = await rowCopy(/^按鈕 WebApp-feature \(feature\/x\)/)
    checkRe(
      n,
      /1 Git file\(s\) copied\. 129 chars · 10 lines · 12 words · ~14 tokens\./,
      '最後一列複製通知'
    )
    return `5 列都有複製鈕,實際點最後一列: ${n.replace(/^\d+ 文字 /, '')}`
  }
})

// ---------- B:變更樹 ----------
defineCase('V1-B1', {
  title: '三個區段內容(檔名、路徑、狀態字母)',
  pre: 'reset',
  run: async () => {
    await v1Start()
    await v1Select('WebApp')
    const t = await v1Tree()
    checkEq(t['CHANGES']?.n, 5, 'CHANGES 數')
    checkEq(t['STAGED CHANGES']?.n, 4, 'STAGED CHANGES 數')
    checkEq(t['UNTRACKED FILES']?.n, 1, 'UNTRACKED FILES 數')
    checkEq(
      v1Sig(t['CHANGES'].rows).join(','),
      [
        'README.md||M',
        'deleted-unstaged.ts|src|D',
        'logo.png||M',
        'partial.ts|src|M',
        'unstaged-mod.ts|src|M'
      ]
        .sort()
        .join(','),
      'CHANGES 列'
    )
    checkEq(
      v1Sig(t['STAGED CHANGES'].rows).join(','),
      ['deleted-staged.ts|src|D', 'new-name.ts|src|R', 'partial.ts|src|M', 'staged-mod.ts|src|M']
        .sort()
        .join(','),
      'STAGED 列'
    )
    checkEq(
      v1Sig(t['UNTRACKED FILES'].rows).join(','),
      'Widget.tsx|src/components/new|U',
      'UNTRACKED 列'
    )
    return 'CHANGES 5 / STAGED 4 / UNTRACKED 1,檔名、路徑、狀態字母全對'
  }
})

defineCase('V1-B2', {
  title: '部分暫存 partial.ts 同時在 CHANGES 與 STAGED',
  pre: 'reset',
  run: async () => {
    await v1Start()
    await v1Select('WebApp')
    const t = await v1Tree()
    check(
      t['CHANGES'].rows.some((r) => r.name === 'partial.ts'),
      'CHANGES 沒有 partial.ts'
    )
    check(
      t['STAGED CHANGES'].rows.some((r) => r.name === 'partial.ts'),
      'STAGED 沒有 partial.ts'
    )
    return 'partial.ts 兩區都有'
  }
})

// ---------- C:Diff 分頁 ----------
defineCase('V1-C1', {
  title: '未暫存 diff,分頁開在 folder',
  pre: 'reset',
  run: async () => {
    await v1Start()
    await closeAll()
    await v1Select('WebApp')
    await app.click(await v1RowIn(SEC_CH, /^text unstaged-mod\.ts src/))
    await sleep(1800)
    check(
      (await v1Tabs()).some((x) => x.startsWith('unstaged-mod.ts (diff)')),
      `沒有 unstaged-mod.ts (diff) 分頁,實際 ${(await v1Tabs()).join(' / ')}`
    )
    checkEq(await v1HeaderRepo(), 'WebApp', 'diff 標頭路徑的 repo')
    check(
      (await grep(/^按鈕 Refresh all repositories/)) !== '',
      '右側欄不再是 folder 面板(workspace 可能跳走了)'
    )
    const c = await v1ContentCheck(['unstaged-edit'], [], 'C1')
    return `開出 unstaged-mod.ts (diff),標頭 WebApp/src,folder 面板仍在${c}`
  }
})

defineCase('V1-C2', {
  title: '已暫存 diff 是 index 版本',
  pre: 'reset',
  run: async () => {
    await v1Start()
    await closeAll()
    await v1Select('WebApp')
    await app.click(await v1RowIn(SEC_ST, /^text partial\.ts src/))
    await sleep(1800)
    check(
      (await v1Tabs()).some((x) => x.startsWith('partial.ts (staged diff)')),
      `沒有 partial.ts (staged diff) 分頁,實際 ${(await v1Tabs()).join(' / ')}`
    )
    const c = await v1ContentCheck(['index-edit'], ['worktree-edit'], 'C2')
    return `staged diff 分頁標題正確${c}`
  }
})

defineCase('V1-C3', {
  title: '未暫存 diff 是工作區版本',
  pre: 'reset',
  run: async () => {
    await v1Start()
    await closeAll()
    await v1Select('WebApp')
    await app.click(await v1RowIn(SEC_CH, /^text partial\.ts src/))
    await sleep(1800)
    check(
      (await v1Tabs()).some((x) => x.startsWith('partial.ts (diff)')),
      `沒有 partial.ts (diff) 分頁,實際 ${(await v1Tabs()).join(' / ')}`
    )
    const c = await v1ContentCheck(['worktree-edit'], [], 'C3')
    return `未暫存 diff 分頁標題正確${c}`
  }
})

defineCase('V1-C4', {
  title: '同名 README 不互相覆蓋(雙擊固定兩個分頁)',
  pre: 'reset',
  run: async () => {
    await v1Start()
    await closeAll()
    await v1Select('WebApp')
    await app.click(await v1RowIn(SEC_CH, /^text README\.md/), { clickCount: 2 })
    await sleep(1800)
    await v1Select('api-server')
    await app.click(await v1RowIn(SEC_CH, /^text README\.md/), { clickCount: 2 })
    await sleep(1800)
    const readmes = await findAll(/^sortable README\.md/)
    checkEq(readmes.length, 2, 'README.md 分頁數')
    const repos = []
    for (let i = 0; i < 2; i++) {
      await app.click((await findAll(/^sortable README\.md/))[i])
      await sleep(1200)
      repos.push(await v1HeaderRepo())
    }
    checkEq([...repos].sort().join(','), 'WebApp,api-server', '兩個分頁各屬哪個 repo')
    return `2 個 README.md 分頁,分別屬於 ${repos.join(' / ')}(內容的 readme change 行未讀)`
  }
})

defineCase('V1-C5', {
  title: 'Open to the Side',
  pre: 'reset',
  run: async () => {
    await v1Start()
    await closeAll()
    await v1Select('WebApp')
    await app.click(await v1RowIn(SEC_CH, /^text partial\.ts src/), { clickCount: 2 })
    await sleep(1500)
    const before = await v1Panes()
    await app.click(await v1RowIn(SEC_CH, /^text unstaged-mod\.ts src/), { mouseButton: 'right' })
    await sleep(800)
    await app.click(await find(/^Open to the Side/))
    await sleep(1800)
    const after = await v1Panes()
    check(after > before, `Open to the Side 後窗格數 ${before} → ${after},沒有新分割`)
    const tabs = await v1Tabs()
    check(
      tabs.some((x) => x.startsWith('unstaged-mod.ts (diff)')),
      `右側沒有 unstaged-mod.ts (diff),實際 ${tabs.join(' / ')}`
    )
    check(
      tabs.some((x) => x.startsWith('partial.ts (diff)')),
      `左邊原本的 partial.ts 分頁不見了,實際 ${tabs.join(' / ')}`
    )
    return `窗格 ${before} → ${after},新分頁 unstaged-mod.ts (diff) 在側邊,原分頁仍在`
  }
})

defineCase('V1-C6', {
  title: 'linked worktree 的 diff',
  pre: 'reset',
  run: async () => {
    await v1Start()
    await closeAll()
    await v1Select('WebApp-feature')
    await app.click(await v1RowIn(SEC_CH, /^text unstaged-mod\.ts src/))
    await sleep(1800)
    check(
      (await v1Tabs()).some((x) => x.startsWith('unstaged-mod.ts (diff)')),
      `沒有 unstaged-mod.ts (diff),實際 ${(await v1Tabs()).join(' / ')}`
    )
    checkEq(await v1HeaderRepo(), 'WebApp-feature', 'diff 標頭路徑的 repo')
    const c = await v1ContentCheck(['feature change'], ['unstaged-edit'], 'C6')
    return `diff 標頭是 WebApp-feature/src${c}`
  }
})

// ---------- D:Stage / Commit ----------
const v1TreeNums = async () => {
  const t = await v1Tree()
  return `${t['CHANGES']?.n}/${t['STAGED CHANGES']?.n}`
}

defineCase('V1-D1', {
  title: 'Stage',
  pre: 'reset',
  mutates: true,
  run: async () => {
    await v1Start()
    await v1Select('WebApp')
    const row = await v1RowIn(SEC_CH, /^text unstaged-mod\.ts src/)
    await app.click(await v1BtnAfterId(row, /^按鈕 Stage$/))
    await sleep(2000)
    const t = await v1Tree()
    checkEq(`${t['CHANGES'].n}/${t['STAGED CHANGES'].n}`, '4/5', 'CHANGES/STAGED')
    check(
      t['STAGED CHANGES'].rows.some((r) => r.name === 'unstaged-mod.ts'),
      'unstaged-mod.ts 沒移到 STAGED'
    )
    checkEq((await v1CountsMap()).WebApp, 10, '清單 WebApp 數字')
    return 'unstaged-mod.ts 進 STAGED,4/5,清單 WebApp 仍 10'
  }
})

defineCase('V1-D2', {
  title: 'Unstage(自帶 stage 前置)',
  pre: 'reset',
  mutates: true,
  run: async () => {
    await v1Start()
    await v1Select('WebApp')
    const row = await v1RowIn(SEC_CH, /^text unstaged-mod\.ts src/)
    await app.click(await v1BtnAfterId(row, /^按鈕 Stage$/))
    await sleep(2000)
    checkEq(await v1TreeNums(), '4/5', 'stage 後 CHANGES/STAGED')
    const srow = await v1RowIn(SEC_ST, /^text unstaged-mod\.ts src/)
    await app.click(await v1BtnAfterId(srow, /^按鈕 Unstage$/))
    await sleep(2000)
    checkEq(await v1TreeNums(), '5/4', 'unstage 後 CHANGES/STAGED')
    return '先 stage 再 unstage,回到 5/4'
  }
})

defineCase('V1-D3', {
  title: '只 commit 一個 repo',
  pre: 'reset',
  mutates: true,
  run: async () => {
    await v1Start()
    await v1Select('core')
    const row = await v1RowIn(SEC_CH, /^text core\.ts/)
    await app.click(await v1BtnAfterId(row, /^按鈕 Stage$/))
    await sleep(1500)
    const box = await find(/^文字項目區域 .*Commit message/)
    await app.setValue(box, '')
    await sleep(300) // 草稿依 repo 留在記憶體,重置測資不會清掉(例如 SC-30.1 的 draft core)
    await app.click(box)
    await sleep(300)
    await app.typeText('ui test commit')
    await sleep(500)
    await app.click(await find(/^按鈕 Commit$/))
    await sleep(3000)
    const want = { 'api-server': 2, core: 1, 'docs-site': 0, WebApp: 10, 'WebApp-feature': 1 }
    const got = await v1WaitUntil(async () => {
      const c = await v1CountsMap()
      return JSON.stringify(c) === JSON.stringify(want) ? c : null
    }, 10000)
    checkEq(
      JSON.stringify(got ?? (await v1CountsMap())),
      JSON.stringify(want),
      'commit 後各 repo 數字'
    )
    const msg = (d) => sh(`git -C "$P/${d}" log -1 --format=%s`).trim()
    checkEq(msg('libs/shared/core'), 'ui test commit', 'core 最新 commit 訊息')
    for (const d of ['WebApp', 'api-server', 'docs-site', 'WebApp-feature']) {
      check(msg(d) !== 'ui test commit', `${d} 不該有這筆 commit`)
    }
    return 'core 變 1,其他不變;git log core=ui test commit,其他 repo 沒有'
  }
})

// ---------- E:自動刷新 ----------
