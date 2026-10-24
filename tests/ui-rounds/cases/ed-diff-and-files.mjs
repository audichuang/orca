const {
  edShot,
  edRead,
  edTabNames,
  edClickTab,
  edMode,
  edHasMode,
  edNoDiffError,
  edType,
  edStart,
  edRepo,
  edRowIn,
  edDbl,
  edWsRow,
  edExpand,
  edRename,
  edQ1,
  edIdOf,
  edQ1Row,
  edAutoSave
} = await import(
  new URL(`./ed-editor-actions.mjs${new URL(import.meta.url).search}`, import.meta.url).href
)

defineCase('ED-12', {
  title: 'Autosave 作用在綁 repo 的分頁',
  pre: 'reset',
  mutates: true,
  run: async () => {
    await edStart()
    try {
      await edAutoSave(true)
      await openMP()
      await edRepo('api-server')
      await edDbl(/^text README\.md/, 2000)
      if (await edHasMode('Source')) {
        await edMode('Source')
      }
      const before = (await edTabNames()).filter((x) => /README/.test(x)).join(',')
      await edType('AUTOSAVED')
      const mid = (await edTabNames()).filter((x) => /README/.test(x)).join(',')
      await sleep(6000)
      const after = (await edTabNames()).filter((x) => /README/.test(x)).join(',')
      check(/AUTOSAVED/.test(edRead('api-server/README.md')), 'api-server/README.md 沒有 AUTOSAVED')
      check(!/AUTOSAVED/.test(edRead('WebApp/README.md')), 'WebApp/README.md 被改到')
      if (await edHasMode('Changes')) {
        await edMode('Changes')
      }
      await edShot()
      return `磁碟有 AUTOSAVED、WebApp README 沒變;分頁 ${before} → ${mid} → ${after} [需看截圖:Changes 檢視是否有 +AUTOSAVED、分頁是否不再 dirty;已知 Source 模式輸入後切回 Changes 不刷新是上游行為]`
    } finally {
      try {
        await edAutoSave(false)
      } catch {}
    }
  }
})

defineCase('ED-13', {
  title: '在 Orca Explorer 裡、repo 內改名',
  pre: 'reset',
  mutates: true,
  run: async () => {
    await edStart()
    await edRepo('WebApp')
    await edDbl(/^text unstaged-mod\.ts src/)
    await edDbl(/^text README\.md/)
    await edRename(['WebApp', 'src'], 'unstaged-mod.ts', 'unstaged-renamed.ts')
    let n = await edTabNames()
    check(
      n.some((x) => x.startsWith('unstaged-renamed.ts (diff)')) &&
        !n.some((x) => x.startsWith('unstaged-mod')),
      `diff 分頁應改名且不重複:${n.join(' / ')}`
    )
    await edRename(['WebApp'], 'README.md', 'README2.md')
    n = await edTabNames()
    check(
      n.some((x) => x.startsWith('README2.md')) && !n.some((x) => x.startsWith('README.md')),
      `README 分頁應改名:${n.join(' / ')}`
    )
    await edClickTab(/^README2\.md/)
    if (await edHasMode('Changes')) {
      await edMode('Changes')
    }
    await edNoDiffError('README2 Changes')
    await edShot()
    const rows = await edQ1()
    const r = edQ1Row(rows, 'WebApp/README2.md')
    check(
      r && r.rel === 'README2.md' && edIdOf('WebApp').test(r.id),
      `Q1 應有 README2.md | WebApp/README2.md | <WebApp id>:${rows.map((x) => x.raw).join(' ; ')}`
    )
    return `diff→unstaged-renamed.ts (diff)、README→README2.md,Q1: ${r.raw} [需看截圖:README2 草稿保留、Changes 整段新增]`
  }
})

defineCase('ED-14', {
  title: '把檔案拖出 repo',
  pre: 'reset',
  mutates: true,
  manual:
    'Explorer 的 HTML5 拖放 lcu drag 觸發不了(上一輪 BLOCKED),需人工或真實滑鼠拖 api-server/server.ts 到 notes/;之後 q1.sh 應有 `notes/server.ts | notes/server.ts | -`',
  run: async () => 'manual'
})

defineCase('ED-15.1', {
  title: '在 Orca 外改名或刪除(1/3:開 staged diff 與 README)',
  pre: 'reset',
  run: async () => {
    await edStart()
    await edRepo('WebApp')
    await app.click(await edRowIn(/^按鈕 STAGED CHANGES \d/, /^text staged-mod\.ts/), {
      clickCount: 2
    })
    await sleep(1500)
    await edDbl(/^text README\.md/)
    const n = await edTabNames()
    check(
      n.some((x) => x.startsWith('staged-mod.ts (staged diff)')) &&
        n.some((x) => x.startsWith('README.md')),
      `分頁:${n.join(' / ')}`
    )
    return n.join(' / ')
  }
})
defineCase('ED-15.2', {
  title: '在 Orca 外改名或刪除(2/3:mv README 後 10 秒)',
  pre: 'script',
  mutates: true,
  run: async () => {
    // 視窗必須可見(隱藏視窗收不到檔案事件)
    await sleep(10000)
    await edClickTab(/^README\.md/)
    const n = await edTabNames()
    check(
      // 10-21 起分頁以狀態字母 D 標示,之前是文字 deleted
      n.some((x) => /^README\.md.*( deleted| D$)/.test(x)),
      `README 分頁應標 deleted:${n.join(' / ')}`
    )
    sh('test ! -e "$P/WebApp/README.md" && test -e "$P/WebApp/README-moved.md"')
    await edShot()
    return `README 分頁:${n.filter((x) => /README/.test(x)).join(',')};原路徑未被寫回 [需看截圖:內容沒被清空]`
  }
})
defineCase('ED-15.3', {
  title: '在 Orca 外改名或刪除(3/3:rm staged-mod.ts 後 staged diff)',
  pre: 'script',
  mutates: true,
  run: async () => {
    await sleep(3000)
    await edClickTab(/^staged-mod\.ts \(staged diff\)/)
    await edNoDiffError('staged diff')
    await edShot()
    sh('test ! -e "$P/WebApp/src/staged-mod.ts"')
    return 'staged diff 分頁仍在 [需看截圖:仍顯示 +staged-edit]'
  }
})

defineCase('ED-16', {
  title: '從 diff 按 Open file(ED-E1)',
  pre: 'reset',
  mutates: true,
  run: async () => {
    await edStart()
    await edRepo('api-server')
    await edDbl(/^text server\.ts/, 1800)
    check(
      (await edTabNames()).some((x) => x.startsWith('server.ts (diff)')),
      '沒有 server.ts (diff) 分頁'
    )
    await app.click(await find(/^按鈕 Open file/))
    await sleep(2000)
    check(
      (await edTabNames()).some((x) => /^server\.ts( [MUD])?$/.test(x)),
      'Open file 沒開出 server.ts edit 分頁'
    )
    let rows = await edQ1()
    let r = edQ1Row(rows, 'api-server/server.ts')
    check(
      r && edIdOf('api-server').test(r.id),
      `第 2 步 Q1 這列應有 api-server 的 id:${rows.map((x) => x.raw).join(' ; ')}`
    )
    await edRename(['api-server'], 'server.ts', 'server2.ts')
    check(
      (await edTabNames()).some((x) => /^server2\.ts( [MUD])?$/.test(x)),
      '改名後沒有 server2.ts 分頁'
    )
    await edClickTab(/^server2\.ts( [MUD])?$/)
    if (await edHasMode('Changes')) {
      await edMode('Changes')
    }
    await edNoDiffError('server2 Changes')
    await edShot()
    rows = await edQ1()
    const r2 = edQ1Row(rows, 'api-server/server2.ts')
    return `Q1 ${r.raw};改名後 Q1: ${r2 ? r2.raw : '(沒有 api-server/server2.ts 列)'} [需看截圖:第 4 步 Changes 顯示 api-server 的 diff]`
  }
})

defineCase('ED-17', {
  title: '從 Explorer 開子 repo 檔再看 Changes(ED-E2)',
  pre: 'reset',
  run: async () => {
    await edStart()
    const id = await edExpand(['WebApp', 'src'], /^按鈕 unstaged-mod\.ts$/)
    await app.click(id, { clickCount: 2 })
    await sleep(1800)
    check(
      (await edTabNames()).some((x) => x.startsWith('unstaged-mod.ts')),
      '沒開出 unstaged-mod.ts 分頁'
    )
    if (await edHasMode('Changes')) {
      await edMode('Changes')
    }
    await edNoDiffError('Changes')
    await edShot()
    const rows = await edQ1()
    const r = edQ1Row(rows, 'WebApp/src/unstaged-mod.ts')
    check(
      r && edIdOf('WebApp').test(r.id),
      `Q1 應帶 WebApp 的 gitWorktreeId(ED-E2 修正後):${rows.map((x) => x.raw).join(' ; ')}`
    )
    return `Q1: ${r.raw} [需看截圖:Changes 只有 +unstaged-edit]`
  }
})

defineCase('ED-18', {
  title: '同一檔從 Explorer 與 Source Control 交替開(ED-E2)',
  pre: 'reset',
  run: async () => {
    await edStart()
    await edRepo('WebApp')
    await edDbl(/^text README\.md/, 2000)
    // 10-21 起 Source Control 開 diff 分頁、Explorer 開檔案分頁,兩種各自不應重複
    const readmeCount = async () => {
      const n = (await edTabNames()).filter((x) => x.startsWith('README.md'))
      return `diff ${n.filter((x) => /\(diff\)/.test(x)).length} / file ${n.filter((x) => !/\(diff\)/.test(x)).length}`
    }
    checkEq(await readmeCount(), 'diff 1 / file 0', '第 1 步 README 分頁數')
    let rows = await edQ1()
    let r1 = edQ1Row(rows, 'WebApp/README.md')
    check(
      r1 && edIdOf('WebApp').test(r1.id),
      `第 1 步 Q1 應帶 WebApp id:${rows.map((x) => x.raw).join(' ; ')}`
    )
    const id = await edExpand(['WebApp'], /^按鈕 README\.md$/)
    await app.click(id)
    await sleep(2000)
    checkEq(await readmeCount(), 'diff 1 / file 1', '第 2 步 README 分頁數')
    rows = await edQ1()
    const r2 = edQ1Row(rows, 'WebApp/README.md')
    if (await edHasMode('Changes')) {
      await edMode('Changes')
    }
    await edNoDiffError('第 2 步 Changes')
    await edShot()
    await app.click(await find(/^按鈕 Source Control/))
    await sleep(1500)
    await edRepo('WebApp')
    await edDbl(/^text README\.md/, 2000)
    checkEq(await readmeCount(), 'diff 1 / file 1', '第 3 步 README 分頁數')
    if (await edHasMode('Changes')) {
      await edMode('Changes')
    }
    await edNoDiffError('第 3 步 Changes')
    await edShot()
    rows = await edQ1()
    const r3 = edQ1Row(rows, 'WebApp/README.md')
    check(
      r3 && edIdOf('WebApp').test(r3.id),
      `第 3 步 Q1 應帶 WebApp id:${rows.map((x) => x.raw).join(' ; ')}`
    )
    return `README 的 diff 與檔案分頁各 1 個、來回不重複;id 第1步 有 / 第2步 ${r2 ? (edIdOf('WebApp').test(r2.id) ? '有' : `無(${r2.id})`) : '無此列'} / 第3步 有 [需看截圖:第 3 步 Changes 為 +webapp readme change]`
  }
})

defineCase('ED-19', {
  title: '分頁列 git 狀態標記(ED-E4)',
  pre: 'reset',
  run: async () => {
    await edStart()
    await edRepo('WebApp')
    await app.click(await edRowIn(/^按鈕 STAGED CHANGES \d/, /^text staged-mod\.ts/), {
      clickCount: 2
    })
    await sleep(1300)
    await edDbl(/^text README\.md/, 1300)
    const mark = (names) => names.filter((x) => /staged-mod|README/.test(x)).join(' | ')
    const folder = mark(await edTabNames())
    await app.click(await edWsRow('WebApp'))
    await sleep(2000)
    if (!(await grep(/^按鈕 CHANGES/))) {
      await app.click(await find(/^按鈕 Source Control/))
      await sleep(1500)
    }
    await edDbl(/^text staged-mod\.ts/, 1300)
    await edDbl(/^text README\.md/, 1300)
    const webapp = mark(await edTabNames())
    await edShot()
    check(
      /staged-mod\.ts \(staged diff\) [MUD]/.test(webapp) &&
        /README\.md( \(diff\))? [MUD]/.test(webapp),
      `WebApp workspace 分頁列應有 M 標記:${webapp}`
    )
    await closeAll()
    return `folder: ${folder};WebApp workspace: ${webapp}`
  }
})

defineCase('ED-20', {
  title: 'Diff 註記存在 repo 底下',
  pre: 'reset',
  mutates: true,
  manual:
    'Add note 要點 diff 行號區的圖示(座標點擊,版面相依);之後在 WebApp main workspace 與 WebApp-feature 對照 Notes 數量,最後 Clear all notes',
  run: async () => 'manual'
})

defineCase('ED-21', {
  title: '巢狀 repo(core)',
  pre: 'reset',
  run: async () => {
    await edStart()
    await edRepo('core')
    await edDbl(/^text core\.ts/)
    await edDbl(/^text untracked\.txt/)
    // 10-21 起未追蹤檔在 CHANGES 裡,View all 開的是 Changes 分頁,列出 core 自己的 2 個檔
    await app.click(await sectionButton('CHANGES', /^按鈕 View all/))
    await sleep(2000)
    const n = await edTabNames()
    check(
      n.some((x) => x.startsWith('core.ts (diff)')),
      `沒有 core.ts diff 分頁:${n.join(' / ')}`
    )
    check(
      n.some((x) => x.startsWith('untracked.txt (diff)')),
      '沒有 untracked.txt diff 分頁'
    )
    check(n.includes('Changes'), '沒有 Changes 分頁')
    const info = await grep(/changed files/)
    checkRe(info, /\b2 changed files/, 'Changes 摘要')
    const copy = await grep(/Help: Copy path/)
    check(
      /untracked\.txt/.test(copy) && /core\.ts/.test(copy) && !/README|partial/.test(copy),
      `Changes 應只有 core 的 core.ts 與 untracked.txt:${copy}`
    )
    await edShot()
    return `${n.join(' / ')};${info.replace(/^\d+ /, '')} [需看截圖:core.ts +core change、untracked.txt 整段新增]`
  }
})
