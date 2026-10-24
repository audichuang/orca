const {
  HOME_,
  V1_ROOT,
  v1CountsMap,
  v1Select,
  v1Tree,
  v1BtnAfterId,
  SEC_CH,
  SEC_ST,
  v1Panes,
  v1Tabs,
  v1Sel,
  v1ClearSel,
  v1MainRow,
  v1Snap,
  v1Exists,
  v1Read,
  v1PvGroups,
  v1Has,
  v1TreeNums
} = await import(
  new URL(`./v1-panel-actions.mjs${new URL(import.meta.url).search}`, import.meta.url).href
)

defineCase('V1-E1.1', {
  title: 'E1 第 1 段:基準,docs-site 為 0',
  pre: 'reset',
  run: async () => {
    await openMP()
    checkEq((await v1CountsMap())['docs-site'], 0, '外部改檔前 docs-site 數字')
    return 'docs-site=0(接著跑 V1-E1.2)'
  }
})

defineCase('V1-E1.2', {
  title: 'E1 第 2 段:外部改檔後 ≤30 秒自動變 1(pre 腳本只追加一行,不重置)',
  pre: 'script',
  mutates: true,
  run: async () => {
    await openMP()
    const mt = Number(sh('stat -f %m "$P/docs-site/index.md"').trim())
    const first = (await v1CountsMap())['docs-site']
    const hit = await waitFor(async () => (await v1CountsMap())['docs-site'] === 1, 35000, 1000)
    const lat = Math.round(Date.now() / 1000 - mt)
    if (hit) {
      check(lat <= 33, `docs-site 約 ${lat} 秒後才變 1(超過 30 秒)`)
      return `docs-site 0→1,距改檔約 ${lat} 秒(起始讀到 ${first})`
    }
    await clickRe(UI_RE.button(UI_TEXT.refreshAll))
    await sleep(3500)
    const after = (await v1CountsMap())['docs-site']
    check(after === 1, `35 秒沒變,手動 Refresh all 後 docs-site=${after}`)
    return '需手動刷新:35 秒內沒自動更新,Refresh all 後變 1(依文件記 PASS,備註需手動刷新)'
  }
})

defineCase('V1-E2', {
  title: 'Orca 內存檔立即更新(在 diff 分頁內編輯 server.ts 並 Cmd+S)',
  pre: 'reset',
  mutates: true,
  run: async () => {
    await openMP()
    await closeAll()
    await v1Select('api-server')
    await app.click(await rowIn(SEC_CH, /^text server\.ts \+ 1 M/), { clickCount: 2 })
    await sleep(2000)
    const eds = await findAll(/^editor/)
    check(eds.length, '開出 diff 分頁後找不到 editor')
    await app.click(eds.at(-1))
    await sleep(400)
    await app.pressKey('cmd+Down')
    await app.pressKey('End')
    await app.typeText('e2 saved line')
    await sleep(300)
    await app.pressKey('cmd+s')
    const t0 = Date.now()
    const hit = await waitFor(
      async () => (await grep(/^text server\.ts \+ 2 M/)) !== '',
      15000,
      400
    )
    check(hit, '存檔後 15 秒內 CHANGES 的 server.ts 沒變 +2')
    const secs = ((Date.now() - t0) / 1000).toFixed(1)
    checkEq(sh(`grep -c 'e2 saved line' "$P/api-server/server.ts"`).trim(), '1', '磁碟上的新行數')
    return `存檔後 ${secs} 秒內 server.ts +1→+2,磁碟有新行`
  }
})

// ---------- F:多選與修飾鍵 ----------
const v1CmdSelectTwo = async () => {
  await v1Select('WebApp')
  await v1ClearSel()
  await app.click(await rowIn(SEC_CH, /^text partial\.ts src/), { key: 'cmd' })
  await sleep(900)
  await app.click(await rowIn(SEC_CH, /^text deleted-unstaged\.ts/), { key: 'cmd' })
  await sleep(900)
}

defineCase('V1-F1', {
  title: 'Cmd+點擊多選(兩列都 Cmd+點擊)',
  pre: 'reset',
  run: async () => {
    await openMP()
    await closeAll()
    const panes0 = await v1Panes()
    await v1CmdSelectTwo()
    checkEq(await v1Sel(), 2, '選取數')
    check(
      (await grep(/^(text|文字) 2 selected$/)) !== '',
      '"2 selected" 沒有在同一個文字節點(可能換行)'
    )
    checkEq(await v1Panes(), panes0, '窗格數(不該開分割)')
    return '"2 selected" 單一文字,沒開分割(選取底色需眼看)'
  }
})

defineCase('V1-F2', {
  title: 'Shift+點擊範圍選取',
  pre: 'reset',
  run: async () => {
    await openMP()
    await closeAll()
    await v1Select('WebApp')
    await v1ClearSel()
    let rows = (await v1Tree())['CHANGES'].rows
    await app.click(rows[0].id)
    await sleep(900)
    rows = (await v1Tree())['CHANGES'].rows
    await app.click(rows[3].id, { key: 'shift' })
    await sleep(900)
    checkEq(await v1Sel(), 4, '選取數')
    return '第 1 列點擊、第 4 列 Shift+點擊 → 4 selected'
  }
})

defineCase('V1-F3', {
  title: 'Option+點擊開分割,不變成選取',
  pre: 'reset',
  run: async () => {
    await openMP()
    await closeAll()
    await v1Select('WebApp')
    await v1ClearSel()
    const before = await v1Panes()
    await app.click(await rowIn(SEC_ST, /^text staged-mod\.ts/), { key: 'alt' })
    await sleep(1800)
    const after = await v1Panes()
    check(after > before, `Option+點擊後窗格數 ${before} → ${after},沒開分割`)
    checkEq(await v1Sel(), 0, '選取數(不該變成選取)')
    check(
      (await v1Tabs()).some((x) => x.startsWith('staged-mod.ts (staged diff)')),
      `沒有 staged-mod.ts (staged diff),實際 ${(await v1Tabs()).join(' / ')}`
    )
    return `窗格 ${before} → ${after},開出 staged-mod.ts (staged diff),沒有選取`
  }
})

defineCase('V1-F4', {
  title: '多選操作列按鈕都點得到',
  pre: 'reset',
  run: async () => {
    await openMP()
    await closeAll()
    await v1CmdSelectTwo()
    checkEq(await v1Sel(), 2, '選取數')
    check((await grep(/^按鈕 Stage \(2\)$/)) !== '', '操作列沒有 Stage (2)')
    check((await grep(/^按鈕 Clear selection/)) !== '', '操作列沒有 Clear selection')
    const b = await btnAfter(/^(text|文字) \d+ selected$/, UI_RE.button(UI_TEXT.copyFullSource), 8)
    const r = await copyAndRead(async () => {
      await app.click(b)
      await sleep(1500)
      return await note()
    })
    checkRe(
      r.note,
      /2 Git file\(s\) copied\. [\d,]+ chars · \d+ lines · \d+ words · ~[\d,]+ tokens\./,
      '操作列複製通知'
    )
    await v1ClearSel()
    checkEq(await v1Sel(), 0, '清除選取後的選取數')
    return `操作列 Stage(2)/複製/× 都點得到: ${r.note.replace(/^\d+ 文字 /, '')}`
  }
})

// ---------- G:Copy Full Source ----------
const V1_G1 = `${V1_ROOT}// file: [DELETED] WebApp/src/deleted-staged.ts\ndeleted-staged\nline2\nline3\n\n\n// file: [MOVED] WebApp/src/new-name.ts\nold-name\nline2\nline3\n\n\n// file: [MODIFIED] WebApp/src/partial.ts\npartial\nline2\nline3\nindex-edit\n\n\n// file: [MODIFIED] WebApp/src/staged-mod.ts\nstaged-mod\nline2\nline3\nstaged-edit\n\n`
const V1_G2 = `${V1_ROOT}// file: [MODIFIED] WebApp/src/partial.ts\npartial\nline2\nline3\nindex-edit\nworktree-edit\n\n\n// file: [DELETED] WebApp/src/deleted-unstaged.ts\ndeleted-unstaged\nline2\nline3\n\n`

defineCase('V1-G1', {
  title: 'STAGED CHANGES 區段標題複製',
  pre: 'reset',
  run: async () => {
    await openMP()
    await v1Select('WebApp')
    await v1ClearSel()
    const btn = await btnAfter(SEC_ST, UI_RE.button(UI_TEXT.copyFullSource))
    const r = await copyAndRead(async () => {
      await app.click(btn)
      await sleep(1500)
      return await note()
    })
    checkRe(
      r.note,
      /4 Git file\(s\) copied\. 327 chars · 27 lines · 33 words · ~41 tokens\./,
      '通知'
    )
    checkEq(r.clip, V1_G1, '剪貼簿')
    return r.note.replace(/^\d+ 文字 /, '')
  }
})

defineCase('V1-G2', {
  title: '右鍵複製多選(兩列都 Cmd+點擊;結尾多一個空行)',
  pre: 'reset',
  run: async () => {
    await openMP()
    await v1CmdSelectTwo()
    const r = await copyAndRead(async () =>
      ctxCopy(await rowIn(SEC_CH, /^text deleted-unstaged\.ts/))
    )
    checkRe(
      r.note,
      /2 Git file\(s\) copied\. 200 chars · 15 lines · 19 words · ~23 tokens\./,
      '通知'
    )
    checkEq(r.clip, V1_G2, '剪貼簿')
    return r.note.replace(/^\d+ 文字 /, '')
  }
})

defineCase('V1-G3', {
  title: 'api-server repo 列複製(同 CC-01)',
  pre: 'reset',
  run: async () => {
    await openMP()
    const r = await copyAndRead(() => rowCopy(/^按鈕 api-server \(main\)/))
    checkEq(
      r.clip,
      `${V1_ROOT}\n// file: [MODIFIED] api-server/README.md\n# api\nbase\napi readme change\n\n\n// file: [MODIFIED] api-server/server.ts\nbase\nlocal 1\nlocal 2\nunstaged api\n\n\n`,
      '剪貼簿'
    )
    return r.note.replace(/^\d+ 文字 /, '')
  }
})

defineCase('V1-G4', {
  title: 'folder 全部複製',
  pre: 'reset',
  run: async () => {
    await openMP()
    const btn = await find(UI_RE.button(UI_TEXT.copyAllChanges))
    const r = await copyAndRead(async () => {
      await app.click(btn)
      await sleep(2000)
      return await note()
    }, 4000)
    checkRe(
      r.note,
      /13 Git file\(s\) copied \(1 skipped: binary\)\. 1,031 chars · 80 lines · 111 words · ~137 tokens\./,
      '通知'
    )
    const c = r.clip
    check(
      c && c.startsWith(`${V1_ROOT}// file: `),
      `第一行不是 clipcode-root 或其後有空行: ${JSON.stringify((c ?? '').slice(0, 60))}`
    )
    const paths = [...c.matchAll(/^\/\/ file: \[[A-Z]+\] (.+)$/gm)].map((m) => m[1])
    checkEq(paths.length, 13, '檔案段數')
    checkEq(new Set(paths).size, 13, '路徑不重複的數量')
    for (const p of paths) {
      check(
        /^(WebApp|WebApp-feature|api-server|libs\/shared\/core)\//.test(p),
        `路徑沒有 repo 資料夾開頭: ${p}`
      )
    }
    check(paths.includes('WebApp/src/partial.ts'), '缺 WebApp/src/partial.ts')
    check(!paths.some((p) => /logo\.png/.test(p)), '不該有 logo.png')
    check(!paths.some((p) => p.startsWith('docs-site/')), '不該有 docs-site 的檔案')
    return '13 檔、路徑唯一且以 repo 資料夾開頭,無 logo.png / docs-site'
  }
})

defineCase('V1-G5', {
  title: '通知格式含四個數字',
  pre: 'reset',
  run: async () => {
    await openMP()
    const n = await rowCopy(/^按鈕 WebApp-feature \(feature\/x\)/)
    checkRe(
      n,
      /\d+ Git file\(s\) copied\. [\d,]+ chars · \d+ lines · \d+ words · ~[\d,]+ tokens\./,
      '通知格式'
    )
    return n.replace(/^\d+ 文字 /, '')
  }
})

// ---------- H:Paste & Restore(每案 pre 腳本自己重置並放好剪貼簿) ----------
defineCase('V1-H1', {
  title: '一般還原(勾 Overwrite)',
  pre: 'script',
  mutates: true,
  run: async () => {
    await afterReset()
    const snap0 = v1Snap()
    const pre = await rs({ restore: false })
    const g = v1PvGroups(pre)
    checkEq(g.Create?.n, 1, 'Create 數')
    v1Has(g, 'Create', /WebApp\/src\/restored\/a\.ts/, '預覽')
    checkEq(g.Overwrite?.n, 1, 'Overwrite 數')
    v1Has(g, 'Overwrite', /api-server\/README\.md/, '預覽')
    checkEq(g.Delete?.n, 1, 'Delete 數')
    v1Has(g, 'Delete', /libs\/shared\/core\/extra\.ts/, '預覽')
    checkEq(g.Skip?.n, 2, 'Skip 數')
    v1Has(g, 'Skip', /\.\.\/escape\.txt/, '預覽')
    v1Has(g, 'Skip', /\/tmp\/orca-ui-abs-escape\.txt/, '預覽')
    v1Has(g, 'Skip', /unsafe path/, '預覽原因')
    v1Has(g, 'Skip', /outside the folder/, '預覽原因')
    checkEq(v1Snap(), snap0, '按 Restore 之前磁碟')
    const r = await rs({ overwrite: true })
    checkRe(r, /Created 1, overwritten 1, deleted 1, skipped 2\./, 'Restore 通知')
    checkEq(v1Read('WebApp/src/restored/a.ts').trimEnd(), 'export const restored = 1', 'a.ts 內容')
    checkEq(
      v1Read('api-server/README.md'),
      '# api\nrestored by ui test',
      'api-server/README.md 內容(結尾無換行)'
    )
    check(!v1Exists(`${P}/libs/shared/core/extra.ts`), 'extra.ts 應已刪除')
    check(!v1Exists(`${HOME_}/escape.txt`), '../escape.txt 不該被寫出')
    check(!v1Exists('/tmp/orca-ui-abs-escape.txt'), '/tmp/orca-ui-abs-escape.txt 不該被寫出')
    return '預覽 Create1/Overwrite1/Delete1/Skip2,Restore 前磁碟不變;Created 1, overwritten 1, deleted 1, skipped 2;磁碟與逃逸檔都對'
  }
})

defineCase('V1-H2', {
  title: '不勾 Overwrite',
  pre: 'script',
  mutates: true,
  run: async () => {
    await afterReset()
    const before = sh('shasum "$P/api-server/README.md"').trim()
    const r = await rs({})
    checkRe(r, /Created 1, overwritten 0, deleted 1, skipped 3\./, 'Restore 通知')
    checkEq(sh('shasum "$P/api-server/README.md"').trim(), before, 'api-server/README.md 雜湊')
    return 'Created 1, overwritten 0, deleted 1, skipped 3;README 未變'
  }
})

defineCase('V1-H3', {
  title: 'symlink 逃逸被擋(git-alias 由建立腳本建好)',
  pre: 'script',
  mutates: true,
  run: async () => {
    await afterReset()
    const before = sh('shasum "$P/WebApp/.git/config"').trim()
    const r = await rs({})
    const g = v1PvGroups(r)
    checkEq(g.Skip?.n, 1, 'Skip 數')
    v1Has(g, 'Skip', /WebApp\/git-alias\/config/, '預覽')
    v1Has(g, 'Skip', /path goes through a symlink/, '預覽原因')
    checkRe(r, /RESTORE DISABLED/, '全被略過時 Restore 應停用')
    checkEq(sh('shasum "$P/WebApp/.git/config"').trim(), before, 'WebApp/.git/config 雜湊')
    return 'Skip: WebApp/git-alias/config(path goes through a symlink),Restore 停用,.git/config 未變'
  }
})

defineCase('V1-H4', {
  title: '略過佔位不覆蓋',
  pre: 'script',
  mutates: true,
  run: async () => {
    await afterReset()
    const before = sh('shasum "$P/docs-site/index.md"').trim()
    const r = await rs({})
    const g = v1PvGroups(r)
    checkEq(g.Skip?.n, 1, 'Skip 數')
    v1Has(g, 'Skip', /docs-site\/index\.md/, '預覽')
    v1Has(g, 'Skip', /skipped when copied/, '預覽原因')
    checkRe(r, /RESTORE DISABLED/, '全被略過時 Restore 應停用')
    checkEq(sh('shasum "$P/docs-site/index.md"').trim(), before, 'docs-site/index.md 雜湊')
    return 'Skip: docs-site/index.md(content was skipped when copied),Restore 停用,檔案未變'
  }
})

defineCase('V1-H5', {
  title: '編輯器未存檔不會蓋回(在 diff 分頁內打字)',
  pre: 'script',
  mutates: true,
  run: async () => {
    await afterReset()
    await closeAll()
    await v1Select('api-server')
    await app.click(await rowIn(SEC_CH, /^text server\.ts \+ 1 M/), { clickCount: 2 })
    await sleep(2000)
    const eds = await findAll(/^editor/)
    check(eds.length, '開出 diff 分頁後找不到 editor')
    await app.click(eds.at(-1))
    await sleep(400)
    await app.pressKey('cmd+Down')
    await app.typeText('UNSAVED')
    await app.pressKey('Escape')
    await sleep(500)
    const r = await rs({ overwrite: true })
    checkRe(r, /Created \d+, overwritten 1/, 'Restore 通知')
    await sleep(5500)
    const disk = v1Read('api-server/server.ts')
    checkEq(disk.trimEnd(), 'restored server content', '磁碟 server.ts')
    check(!disk.includes('UNSAVED'), '磁碟被未存檔內容蓋回')
    const ban = await grep(/changed on disk/i)
    check(ban !== '', '編輯器沒有「檔案在磁碟上已變更」提示')
    return `磁碟是 restored server content,沒被 UNSAVED 蓋回;提示: ${ban.replace(/^\d+ \S+ /, '').slice(0, 80)}`
  }
})

defineCase('V1-H6', {
  title: '非 ClipCode 內容(剪貼簿 hello)',
  pre: 'script',
  run: async () => {
    await openMP()
    const snap0 = v1Snap()
    await app.click(await find(UI_RE.button(UI_TEXT.pasteRestore)))
    await sleep(1500)
    const n = await note()
    checkRe(n, /No Snipcode file headers found in clipboard\./, '提示')
    check((await grep(/^標題 Paste & Restore/)) === '', '不該出預覽對話框')
    checkEq(v1Snap(), snap0, '磁碟')
    return 'No Snipcode file headers found in clipboard.,沒預覽、檔案未變'
  }
})

// ---------- I:IntelliJ 交叉(改用 IJ 組) ----------
for (const [id, v] of [
  ['V1-I1', 'Orca → IntelliJ'],
  ['V1-I2', 'IntelliJ → Orca'],
  ['V1-I3', 'token 數一致']
]) {
  defineCase(id, { title: v, manual: `改用 IJ 組(docs/fork/v2/05-ij.md):${v}` })
}

// ---------- J:一般 repo workspace 回歸 ----------
const v1EnterWebAppMain = async () => {
  await openMP()
  await app.click(await v1MainRow('WebApp'))
  await sleep(2000)
  if (!(await grep(/^按鈕 CHANGES \d/))) {
    await clickRe(UI_RE.buttonStart(UI_TEXT.sourceControlTab))
    await sleep(1500)
  }
  check(
    (await grep(UI_RE.button(UI_TEXT.refreshAll))) === '',
    'WebApp main workspace 不該有 folder 面板'
  )
  check((await grep(/^按鈕 CHANGES \d/)) !== '', 'WebApp main workspace 沒有 CHANGES 區段')
}

defineCase('V1-J1', {
  title: '單一 repo 面板照舊',
  pre: 'reset',
  // stage 後才 unstage;中途失敗會留下 staged 的檔
  mutates: true,
  run: async () => {
    await closeAll() // closeAll 結尾會切回 MultiProduct,要先關再進 WebApp main
    await v1EnterWebAppMain()
    check((await grep(/^container Repositories$/)) === '', '單一 repo 面板不該有 repo 清單')
    await app.click(await rowIn(SEC_CH, /^text unstaged-mod\.ts src/))
    await sleep(1800)
    check(
      (await v1Tabs()).some((x) => x.startsWith('unstaged-mod.ts (diff)')),
      `沒有 unstaged-mod.ts (diff),實際 ${(await v1Tabs()).join(' / ')}`
    )
    check(
      (await grep(UI_RE.button(UI_TEXT.refreshAll))) === '',
      'diff 開啟後跳出了 folder 面板(workspace 可能切走)'
    )
    const row = await rowIn(SEC_CH, /^text unstaged-mod\.ts src/)
    await app.click(await v1BtnAfterId(row, /^按鈕 Stage$/))
    await sleep(1800)
    checkEq(await v1TreeNums(), '5/5', 'stage 後 CHANGES/STAGED')
    const srow = await rowIn(SEC_ST, /^text unstaged-mod\.ts src/)
    await app.click(await v1BtnAfterId(srow, /^按鈕 Unstage$/))
    await sleep(1800)
    checkEq(await v1TreeNums(), '6/4', 'unstage 後 CHANGES/STAGED')
    return '無 repo 清單;diff 開在 WebApp main;stage/unstage 6/4→5/5→6/4'
  }
})

defineCase('V1-J2', {
  title: '修飾鍵行為:Cmd+點擊多選,右鍵有 Open to the Side / Copy Full Source',
  pre: 'reset',
  run: async () => {
    await closeAll() // closeAll 結尾會切回 MultiProduct,要先關再進 WebApp main
    await v1EnterWebAppMain()
    await v1ClearSel()
    const panes0 = await v1Panes()
    await app.click(await rowIn(SEC_CH, /^text README\.md/), { key: 'cmd' })
    await sleep(600)
    await app.click(await rowIn(SEC_ST, /^text staged-mod\.ts/), { key: 'cmd' })
    await sleep(900)
    checkEq(await v1Sel(), 2, '選取數')
    checkEq(await v1Panes(), panes0, '窗格數(Cmd+點擊不該開分割)')
    await app.click(await rowIn(SEC_ST, /^text staged-mod\.ts/), { mouseButton: 'right' })
    await sleep(900)
    check((await findAll(/^Open to the Side/)).length > 0, '右鍵選單沒有 Open to the Side')
    check((await findAll(/^Copy Full Source/)).length > 0, '右鍵選單沒有 Copy Full Source')
    await app.pressKey('Escape')
    await sleep(300)
    await v1ClearSel()
    return 'Cmd+點擊兩列 → 2 selected 且沒開分割;右鍵選單有 Open to the Side 與 Copy Full Source'
  }
})
