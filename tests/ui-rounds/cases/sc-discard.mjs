const {
  need,
  scStart,
  scCnt,
  scAllCnt,
  scSec,
  scRowBtn,
  CH,
  ST,
  UT,
  scDlg,
  scConfirm,
  scShell,
  scGrepC,
  scLines,
  scPorcelain
} = await import(
  new URL(`./sc-panel-actions.mjs${new URL(import.meta.url).search}`, import.meta.url).href
)

// =====================================================================================
// Discard 範圍
// =====================================================================================
defineCase('SC-01', {
  title: '單檔 discard 只作用在選中 repo(linked worktree 同路徑)',
  pre: 'reset',
  mutates: true,
  run: async () => {
    await scStart()
    await selectRepo('WebApp')
    await app.click(await scRowBtn(CH, /^text unstaged-mod\.ts src/, /^按鈕 Discard changes/))
    await sleep(1000)
    const d = await scDlg()
    need(d, '沒有出現確認對話框')
    checkEq(d.title, 'Discard changes to "unstaged-mod.ts"?', '對話框標題')
    await scConfirm(/^按鈕 Discard$/)
    // 6 → 5:CHANGES 含未追蹤的 Widget.tsx(10-21 起)
    const chg = await waitFor(async () => (await scSec('CHANGES')) === 5)
    check(chg, `CHANGES 應為 5,實際 ${await scSec('CHANGES')}`)
    checkEq(await scCnt('WebApp'), 9, '清單 WebApp')
    checkEq(await scCnt('WebApp-feature'), 1, '清單 WebApp-feature')
    const n = await waitFor(() => scLines('$P/WebApp/src/unstaged-mod.ts') === 3)
    check(
      n,
      `WebApp/src/unstaged-mod.ts 應剩 3 行,實際 ${scLines('$P/WebApp/src/unstaged-mod.ts')}`
    )
    checkEq(
      scPorcelain('$P/WebApp-feature').trimEnd(),
      ' M src/unstaged-mod.ts',
      'WebApp-feature status'
    )
    checkEq(
      scGrepC("'feature change'", '$P/WebApp-feature/src/unstaged-mod.ts'),
      1,
      'feature change 行數'
    )
    return `標題「${d.title}」;CHANGES 5、WebApp 9、feature 1;檔案 3 行;feature 仍 M`
  }
})

defineCase('SC-02', {
  title: '還原已刪除的檔案',
  pre: 'reset',
  mutates: true, // 原文接續 SC-01;獨立執行時 CHANGES 5→4(接續則 4→3)
  run: async () => {
    await scStart()
    await selectRepo('WebApp')
    const before = await scAllCnt()
    const chg0 = await scSec('CHANGES')
    await app.click(await scRowBtn(CH, /^text deleted-unstaged\.ts/, /^按鈕 Restore file/))
    await sleep(1000)
    const d = await scDlg()
    need(d, '沒有出現確認對話框')
    checkEq(d.title, 'Restore "deleted-unstaged.ts"?', '對話框標題')
    await scConfirm(/^按鈕 Restore$/)
    const ok = await waitFor(
      () => scShell('cat $P/WebApp/src/deleted-unstaged.ts') === 'deleted-unstaged\nline2\nline3\n',
      6000
    )
    check(
      ok,
      `deleted-unstaged.ts 內容不對:${JSON.stringify(scShell('cat $P/WebApp/src/deleted-unstaged.ts'))}`
    )
    check(
      await waitFor(async () => (await scSec('CHANGES')) === chg0 - 1),
      `CHANGES 應由 ${chg0} 變 ${chg0 - 1},實際 ${await scSec('CHANGES')}`
    )
    const after = await scAllCnt()
    for (const r of REPOS) {
      if (r !== 'WebApp') {
        checkEq(after[r], before[r], `其他 repo ${r}`)
      }
    }
    return `標題「${d.title}」;檔案回來;CHANGES ${chg0}→${chg0 - 1};其他 repo 不變`
  }
})

defineCase('SC-03', {
  title: 'CHANGES 的 Discard all',
  pre: 'reset',
  mutates: true,
  run: async () => {
    await scStart()
    await selectRepo('WebApp')
    await app.click(await sectionButton(CH, /^按鈕 Discard all/))
    await sleep(1000)
    const d = await scDlg()
    need(d, '沒有出現確認對話框')
    checkEq(d.title, 'Discard all unstaged changes?', '對話框標題')
    checkRe(
      d.text,
      // 10-21 起未追蹤檔在 CHANGES 裡,Discard all 會一起刪掉
      /This will revert unstaged changes and permanently delete any untracked files among these 6 files\. This cannot be undone\./,
      '對話框說明'
    )
    await scConfirm(/^按鈕 Discard all$/, 3500)
    check(
      await waitFor(() => scShell('git -C $P/WebApp diff --name-only').trim() === ''),
      `diff --name-only 應為空:${scShell('git -C $P/WebApp diff --name-only')}`
    )
    checkRe(
      scShell('git -C $P/WebApp diff --cached src/partial.ts'),
      /\+index-edit/,
      'cached partial.ts'
    )
    checkEq(scGrepC('worktree-edit', '$P/WebApp/src/partial.ts'), 0, 'worktree-edit 行數')
    checkEq(scGrepC("'api readme change'", '$P/api-server/README.md'), 1, 'api-server README')
    checkRe(scPorcelain('$P/WebApp-feature'), /^ M src\/unstaged-mod\.ts/, 'WebApp-feature')
    checkEq(
      scShell('test -e $P/WebApp/src/components/new/Widget.tsx && echo yes').trim(),
      '',
      '未追蹤的 Widget.tsx 應已刪除'
    )
    check(
      await waitFor(async () => (await scCnt('WebApp')) === 4),
      `清單 WebApp 應為 4,實際 ${await scCnt('WebApp')}`
    )
    return `對話框「${d.title}」「6 files」;diff 空、Widget.tsx 已刪、cached 仍 +index-edit、WebApp 4、feature 仍 1`
  }
})

defineCase('SC-04', {
  title: '刪除 untracked 只動選中 repo、不碰排除的 symlink',
  pre: 'reset',
  mutates: true,
  run: async () => {
    await scStart()
    await selectRepo('WebApp')
    // 10-21 起沒有 Delete all untracked,未追蹤檔在 CHANGES 裡逐列刪
    await app.click(
      await scRowBtn(UT, /^text Widget\.tsx src\/components\/new/, /^按鈕 Delete untracked file/)
    )
    await sleep(1000)
    const d1 = await scDlg()
    need(d1, '第 1 步沒有對話框')
    checkEq(d1.title, 'Delete "Widget.tsx"?', '第 1 步標題')
    await scConfirm(/^按鈕 Delete$/)
    check(
      await waitFor(
        () =>
          scShell('test ! -e $P/WebApp/src/components/new/Widget.tsx && echo gone').trim() ===
          'gone',
        6000
      ),
      'Widget.tsx 還在'
    )
    checkEq(
      scShell('test -L $P/WebApp/git-alias && test -L $P/WebApp/outside-link && echo both').trim(),
      'both',
      'symlink 仍在'
    )
    checkEq(
      scShell('test -e $P/libs/shared/core/untracked.txt && echo yes').trim(),
      'yes',
      '第 1 步後 core untracked.txt 應仍在'
    )
    await selectRepo('core')
    await app.click(await scRowBtn(UT, /^text untracked\.txt/, /^按鈕 Delete untracked file/))
    await sleep(1000)
    const d2 = await scDlg()
    need(d2, '第 2 步沒有對話框')
    checkEq(d2.title, 'Delete "untracked.txt"?', '第 2 步標題')
    await scConfirm(/^按鈕 Delete$/)
    check(
      await waitFor(
        () => scShell('test ! -e $P/libs/shared/core/untracked.txt && echo gone').trim() === 'gone',
        6000
      ),
      '第 2 步後 core untracked.txt 還在'
    )
    check(
      await waitFor(async () => (await scCnt('core')) === 1),
      `core 應為 1,實際 ${await scCnt('core')}`
    )
    return `「${d1.title}」「${d2.title}」;Widget 刪除、兩 symlink 在;core untracked 第 2 步才刪;core 1`
  }
})

defineCase('SC-05', {
  title: 'STAGED 的 Discard all',
  pre: 'reset',
  mutates: true,
  run: async () => {
    await scStart()
    const feat0 = scPorcelain('$P/WebApp-feature'),
      api0 = scPorcelain('$P/api-server')
    await selectRepo('WebApp')
    await app.click(await sectionButton(ST, /^按鈕 Discard all/))
    await sleep(1000)
    const d = await scDlg()
    need(d, '沒有出現確認對話框')
    checkEq(d.title, 'Discard all staged changes?', '對話框標題')
    await scConfirm(/^按鈕 Discard all$/, 4000)
    check(
      await waitFor(() => scShell('git -C $P/WebApp diff --cached --name-only').trim() === ''),
      'cached 應為空'
    )
    check(
      await waitFor(() => scLines('$P/WebApp/src/staged-mod.ts') === 3),
      `staged-mod.ts 應 3 行,實際 ${scLines('$P/WebApp/src/staged-mod.ts')}`
    )
    checkEq(
      scShell(
        'cd $P/WebApp/src && test -e deleted-staged.ts && test -e old-name.ts && test ! -e new-name.ts && echo ok'
      ).trim(),
      'ok',
      'deleted-staged / old-name / new-name'
    )
    checkEq(scPorcelain('$P/WebApp-feature'), feat0, 'WebApp-feature status')
    checkEq(scPorcelain('$P/api-server'), api0, 'api-server status')
    const we = scGrepC('worktree-edit', '$P/WebApp/src/partial.ts')
    return `「${d.title}」;cached 空、檔案復原;其他 repo 不變。觀察:partial.ts 的 worktree-edit ${we ? '仍在' : '也消失(上游語意)'}`
  }
})

defineCase('SC-06', {
  title: 'tree 檢視的資料夾 discard',
  pre: 'reset',
  mutates: true,
  run: async () => {
    await scStart()
    const others0 = { feat: scPorcelain('$P/WebApp-feature'), api: scPorcelain('$P/api-server') }
    await selectRepo('WebApp')
    await app.click(await find(/^彈出式按鈕 More source control actions/))
    await sleep(800)
    await app.click(await find(/^View as tree/))
    await sleep(1500)
    try {
      await app.click(await scRowBtn(CH, /^按鈕 src$/, /^按鈕 Discard folder/))
      await sleep(1000)
      const d = await scDlg()
      need(d, '第 2 步沒有對話框')
      await scConfirm(/^按鈕 (Discard|Discard all|Discard folder)$/, 3500)
      check(
        await waitFor(
          () =>
            scShell('git -C $P/WebApp diff --name-only').trim().split('\n').sort().join(',') ===
            'README.md,logo.png'
        ),
        `第 2 步後 diff --name-only 應只剩 README.md、logo.png,實際 ${scShell('git -C $P/WebApp diff --name-only').trim().replace(/\n/g, ',')}`
      )
      // 10-21 起未追蹤檔也在 CHANGES 的 src 底下,資料夾 discard 一起刪掉
      check(
        await waitFor(
          () =>
            scShell('test ! -e $P/WebApp/src/components/new/Widget.tsx && echo gone').trim() ===
            'gone',
          6000
        ),
        '第 2 步後 Widget.tsx 還在'
      )
      checkEq(scPorcelain('$P/WebApp-feature'), others0.feat, 'WebApp-feature')
      checkEq(scPorcelain('$P/api-server'), others0.api, 'api-server')
      return `第 2 步對話框「${d.title}」(${d.text.split(' | ').pop()});diff 只剩 README.md/logo.png,未追蹤的 Widget 一起刪除;其他 repo 不變`
    } finally {
      try {
        await app.click(await find(/^彈出式按鈕 More source control actions/))
        await sleep(700)
        const v = (await lines()).find(([, t]) => t.startsWith('View as list'))
        await (v ? app.click(v[0]) : app.pressKey('Escape'))
        await sleep(800)
      } catch {}
    }
  }
})

defineCase('SC-07', {
  title: 'Discard 時 folder 編輯分頁的 autosave 不會寫回',
  pre: 'reset',
  mutates: true,
  run: async () => {
    await scStart()
    await setAutoSave(true, 10000)
    try {
      await app.click(await find(/^按鈕 Explorer/))
      await sleep(1000)
      let ex = (await lines()).filter(([, t]) => /^按鈕 server\.ts$/.test(t))
      if (!ex.length) {
        await app.click(await find(/^按鈕 api-server$/))
        await sleep(800)
        ex = (await lines()).filter(([, t]) => /^按鈕 server\.ts$/.test(t))
      }
      need(ex.length, 'Explorer 找不到 api-server/server.ts')
      await app.click(ex[0][0], { clickCount: 2 })
      await sleep(1800)
      const ed = (await lines()).filter(([, t]) => t.startsWith('editor (settable)'))
      need(ed.length, '沒有編輯器')
      await app.click(ed.at(-1)[0])
      await app.pressKey('cmd+Down')
      await app.typeText('AUTOSAVE-X')
      const t0 = Date.now()
      await app.click(await find(UI_RE.buttonStart(UI_TEXT.sourceControlTab)))
      await sleep(1000)
      await selectRepo('api-server')
      await sleep(400)
      await app.click(await scRowBtn(CH, /^text server\.ts \+ 1 M/, /^按鈕 Discard changes/))
      await sleep(700)
      await scConfirm(/^按鈕 Discard$/, 300)
      const gap = (Date.now() - t0) / 1000
      check(gap < 10, `打字後 ${gap}s 才完成 Discard,超過 10 秒窗口`)
      await sleep(15000)
      checkEq(scGrepC('AUTOSAVE-X', '$P/api-server/server.ts'), 0, 'AUTOSAVE-X 行數(磁碟被寫回)')
      checkEq(scGrepC("'unstaged api'", '$P/api-server/server.ts'), 0, 'unstaged api 行數')
      const banner = await grep(/changed on disk|Reload from Disk|Keep My Edits/)
      await evidenceShot()
      return `${gap}s 內 discard;15 秒後磁碟無 AUTOSAVE-X/unstaged api;編輯器${banner ? '出現「changed on disk」提示' : '無提示(應已重載,截圖確認)'}`
    } finally {
      try {
        const r = await findAll(/^按鈕 Reload from Disk/)
        if (r.length) {
          await app.click(r[0])
          await sleep(800)
        }
      } catch {}
      try {
        await setAutoSave(false, 1000)
      } catch {}
    }
  }
})

defineCase('SC-08', {
  title: 'Discard 後乾淨的編輯分頁自動重載;同名 diff 分頁互不影響',
  pre: 'reset',
  mutates: true,
  run: async () => {
    await scStart()
    await app.click(await find(/^按鈕 Explorer/))
    await sleep(1000)
    let ex = (await lines()).filter(([, t]) => /^按鈕 server\.ts$/.test(t))
    if (!ex.length) {
      await app.click(await find(/^按鈕 api-server$/))
      await sleep(800)
      ex = (await lines()).filter(([, t]) => /^按鈕 server\.ts$/.test(t))
    }
    need(ex.length, 'Explorer 找不到 api-server/server.ts')
    await app.click(ex[0][0], { clickCount: 2 })
    await sleep(1500)
    await app.click(await find(UI_RE.buttonStart(UI_TEXT.sourceControlTab)))
    await sleep(1000)
    await selectRepo('WebApp')
    await app.click(await find(/^text README\.md/), { clickCount: 2 })
    await sleep(1500)
    await selectRepo('api-server')
    await app.click(await find(/^text README\.md/), { clickCount: 2 })
    await sleep(1500)
    check((await findAll(/^sortable README\.md/)).length >= 2, '前置:應有兩個 README.md 分頁')
    // 對 api-server 的 server.ts / README.md discard
    await app.click(await scRowBtn(CH, /^text server\.ts \+ 1 M/, /^按鈕 Discard changes/))
    await sleep(700)
    await scConfirm(/^按鈕 Discard$/, 1500)
    await app.click(await scRowBtn(CH, /^text README\.md/, /^按鈕 Discard changes/))
    await sleep(700)
    await scConfirm(/^按鈕 Discard$/, 2500)
    check(
      await waitFor(() => scGrepC("'unstaged api'", '$P/api-server/server.ts') === 0, 5000),
      '磁碟 server.ts 仍有 unstaged api'
    )
    checkEq(scGrepC("'api readme change'", '$P/api-server/README.md'), 0, 'api README 磁碟')
    checkEq(
      scGrepC("'webapp readme change'", '$P/WebApp/README.md'),
      1,
      'WebApp README 磁碟不受影響'
    )
    const tabs = (await lines()).filter(([, t]) => /^sortable (server\.ts|README\.md)/.test(t))
    need(tabs.length >= 3, `分頁數不足:${tabs.length}`)
    const seen = []
    for (const [tb] of tabs) {
      await app.click(tb)
      await sleep(1200)
      // diff 分頁的標籤帶狀態字母(README.md (diff) M);乾淨了字母消失、內文改顯示檔案本身(10-21 前是 No uncommitted changes)
      const label = (await lines()).find(([n]) => n === tb)?.[1] ?? ''
      const clean = (await grep(/No uncommitted changes/)) || /\(diff\) Close tab/.test(label)
      seen.push(!/\(diff\)/.test(label) ? 'file' : clean ? 'clean' : 'diff')
      await evidenceShot()
    }
    // 兩個 README 分頁:一個 clean(api-server)、一個仍有 diff(WebApp)
    const nClean = seen.filter((x) => x === 'clean').length
    check(nClean >= 1, `沒有任何分頁顯示 No uncommitted changes:${seen.join(',')}`)
    return `磁碟:server.ts/api README 已復原、WebApp README 仍有變更;分頁狀態 ${seen.join('/')}(順序同分頁列)。server.ts 分頁與 WebApp README 內容需看截圖確認(AX 讀不到編輯器內文)`
  }
})
