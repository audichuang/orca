const {
  edRead,
  edTabNames,
  edClickTab,
  edMode,
  edHasMode,
  edType,
  edStart,
  edDbl,
  edViewAll,
  edOpenInEditor,
  edQ1,
  edIdOf,
  edQ1Row,
  edConflictRowRe
} = await import(
  new URL(`./ed-editor-actions.mjs${new URL(import.meta.url).search}`, import.meta.url).href
)

// =====================================================================
// ED:編輯器與 diff
// =====================================================================

defineCase('ED-01', {
  title: '同名檔、linked worktree 的 diff 分頁隔離',
  pre: 'reset',
  run: async () => {
    await edStart()
    await selectRepo('WebApp')
    await edDbl(/^text unstaged-mod\.ts src/)
    await selectRepo('WebApp-feature')
    await edDbl(/^text unstaged-mod\.ts src/)
    let n = (await edTabNames()).filter((x) => x.startsWith('unstaged-mod.ts (diff)'))
    checkEq(n.length, 2, '第 2 步後 unstaged-mod.ts diff 分頁數')
    await selectRepo('WebApp')
    await app.click(await find(/^text unstaged-mod\.ts src/))
    await sleep(1500)
    n = (await edTabNames()).filter((x) => x.startsWith('unstaged-mod.ts (diff)'))
    checkEq(n.length, 2, '第 3 步(單擊回 WebApp)後 unstaged-mod.ts diff 分頁數')
    await evidenceShot()
    return '2 個 unstaged-mod.ts (diff) 分頁,第 3 步沒有新增 [需看截圖:WebApp 分頁 +unstaged-edit、feature 分頁 +feature change]'
  }
})

defineCase('ED-02.1', {
  title: '外部改檔只刷新所屬 repo(1/3:開兩個分頁,停在 WebApp)',
  pre: 'reset',
  run: async () => {
    await edStart()
    await selectRepo('WebApp')
    await edDbl(/^text unstaged-mod\.ts src/)
    await selectRepo('WebApp-feature')
    await edDbl(/^text unstaged-mod\.ts src/)
    checkEq(
      (await edTabNames()).filter((x) => x.startsWith('unstaged-mod.ts (diff)')).length,
      2,
      '兩個 diff 分頁'
    )
    await edClickTab(/^unstaged-mod\.ts \(diff\)/, 0)
    return '兩個 diff 分頁已開,停在 WebApp 分頁(下一段 pre 會改 feature 的檔)'
  }
})
defineCase('ED-02.2', {
  title: '外部改檔(2/3:改 feature 後 5 秒,切到 feature 分頁)',
  pre: 'script',
  mutates: true,
  run: async () => {
    await sleep(5000)
    const t0 = Date.now()
    await edClickTab(/^unstaged-mod\.ts \(diff\)/, 1)
    await sleep(1500)
    await evidenceShot()
    const feat = edRead('WebApp-feature/src/unstaged-mod.ts')
    check(/ext-feature/.test(feat), '磁碟上 feature 檔沒有 ext-feature(pre 沒跑?)')
    return `已切到 feature 分頁(${((Date.now() - t0) / 1000).toFixed(1)}s) [需看截圖:feature 分頁要有 +ext-feature]`
  }
})
defineCase('ED-02.3', {
  title: '外部改檔(3/3:改 WebApp 後切回 WebApp 分頁)',
  pre: 'script',
  mutates: true,
  run: async () => {
    const t0 = Date.now()
    await sleep(4000)
    await evidenceShot() // 還在 feature 分頁:不應有 ext-webapp
    await edClickTab(/^unstaged-mod\.ts \(diff\)/, 0)
    await sleep(1500)
    await evidenceShot() // WebApp 分頁:要有 ext-webapp,不需重開
    check(
      /ext-webapp/.test(edRead('WebApp/src/unstaged-mod.ts')),
      '磁碟上 WebApp 檔沒有 ext-webapp'
    )
    check(
      !/ext-webapp/.test(edRead('WebApp-feature/src/unstaged-mod.ts')),
      'feature 檔被寫進 ext-webapp'
    )
    checkEq(
      (await edTabNames()).filter((x) => x.startsWith('unstaged-mod.ts (diff)')).length,
      2,
      '分頁數(不需重開)'
    )
    return `${((Date.now() - t0) / 1000).toFixed(1)}s [需看截圖:第 1 張 feature 分頁 +ext-feature 無 ext-webapp;第 2 張 WebApp 分頁 +ext-webapp 無 ext-feature]`
  }
})

defineCase('ED-04', {
  title: '刪除檔的 diff 停用 Open file',
  pre: 'reset',
  run: async () => {
    await edStart()
    await selectRepo('WebApp')
    await edDbl(/^text deleted-unstaged\.ts/, 1800)
    const d = await grep(/Open file/)
    checkRe(d, /disabled/, 'deleted-unstaged 的 Open file 應停用')
    await evidenceShot()
    await app.click(await rowIn(/^按鈕 STAGED CHANGES \d/, /^text staged-mod\.ts/), {
      clickCount: 2
    })
    await sleep(1800)
    const s = await grep(/Open file/)
    check(s && !/disabled/.test(s), `staged-mod 的 Open file 應可按:${s}`)
    return `deleted-unstaged: ${d.replace(/^\d+ /, '')};staged-mod: ${s.replace(/^\d+ /, '')} [整段紅色需看截圖]`
  }
})

defineCase('ED-05.1', {
  title: '衝突檔 banner(1/2:開檔、確認 banner、改成單行存檔)',
  pre: 'script',
  mutates: true,
  run: async () => {
    await edStart()
    await selectRepo('docs-site')
    checkRe(await grep(/Merge conflicts/), /2 unresolved|unresolved/i, 'docs-site 應有未解決衝突')
    await edDbl(edConflictRowRe, 2000)
    checkRe(await grep(/^sortable index/), /index\.md/, '第 1 步 edit 分頁')
    const b = await grep(/Unresolved conflict/)
    checkRe(b, /Unresolved conflict · Both modified/, '第 2 步 banner')
    check(await grep(/Next conflict/), '第 2 步找不到 Next conflict')
    if (await edHasMode('Source')) {
      await edMode('Source')
    }
    const e = (await lines()).filter(([, t]) => t.startsWith('editor (settable)'))
    check(e.length, '找不到 editor')
    await app.click(e.at(-1)[0])
    await app.pressKey('cmd+a')
    await app.typeText('docs merged\n')
    await app.pressKey('cmd+s')
    await sleep(2500)
    checkRe(edRead('docs-site/index.md'), /^docs merged\n?$/, '第 3 步存檔後磁碟內容')
    return `banner: ${b.replace(/^\d+ /, '')};已存成單行 docs merged`
  }
})
defineCase('ED-05.2', {
  title: '衝突檔 banner(2/2:stage 後不切分頁,banner 跟著更新)',
  pre: 'script',
  mutates: true,
  run: async () => {
    // 步驟 4(按 Stage)由 pre/ED-05.2.sh 用 git add 代替:衝突列的 Stage 是 hover 按鈕,AX 抓不到
    await edClickTab(/^index\.md/)
    let b = '',
      t = 0
    for (; t <= 30; t += 1) {
      b = (await grep(/Unresolved conflict · |Resolved locally/)) || ''
      if (!/Unresolved conflict · /.test(b)) {
        break
      }
      await sleep(1000)
    }
    check(!/Unresolved conflict · /.test(b), `第 5 步:banner 一直是 Unresolved(${t}s)`)
    return `banner ${t}s 內變成: ${b ? b.replace(/^\d+ /, '') : '(消失)'}`
  }
})

defineCase('ED-06.1', {
  title: 'Conflict Review 分頁(1/2:清單、內容、點 README、Refresh)',
  pre: 'script',
  mutates: true,
  run: async () => {
    await edStart()
    await selectRepo('docs-site')
    await app.click(await find(/^按鈕 Review conflicts/))
    await sleep(2500)
    check((await edTabNames()).includes('Conflict Review'), '分頁標題 Conflict Review')
    for (let k = 0; k < 10 && (await grep(/Loading conflict contents/)); k++) {
      await sleep(1000)
    }
    check(!(await grep(/Loading conflict contents/)), '一直停在 Loading conflict contents...')
    check(await grep(/^按鈕 README\.md Unresolved/), '清單沒有 README.md')
    check(await grep(/^按鈕 index\.md Unresolved/), '清單沒有 index.md')
    await app.click(await find(/^按鈕 README\.md Unresolved/))
    await sleep(1800)
    const b = await grep(/Unresolved conflict · /)
    checkRe(b, /Both added/, '第 3 步 README 的 banner')
    check(await grep(/^editor \(settable\)/), '第 3 步沒有可編輯 editor')
    await app.click(await find(/^按鈕 Refresh$/))
    await sleep(2500)
    check(!(await grep(/Loading conflict contents/)), '第 4 步 Refresh 後卡在 Loading')
    check(await grep(/^按鈕 README\.md Unresolved/), '第 4 步 Refresh 後清單不見 README.md')
    await evidenceShot()
    return `清單 README.md(Both added)/index.md 皆在,內容載完,可編輯;banner: ${b.replace(/^\d+ /, '')}`
  }
})
defineCase('ED-06.2', {
  title: 'Conflict Review 分頁(2/2:外部解決並 git add 後 Refresh)',
  pre: 'script',
  mutates: true,
  run: async () => {
    await edClickTab(/^Conflict Review/)
    const r = await grep(/^按鈕 Refresh$/)
    if (r) {
      await app.click(await find(/^按鈕 Refresh$/))
      await sleep(2500)
    }
    let ok = ''
    for (let k = 0; k < 8 && !ok; k++) {
      ok = await grep(/All conflicts resolved/)
      if (!ok) {
        await sleep(1000)
      }
    }
    check(ok, '第 5 步沒有顯示 All conflicts resolved')
    check(await grep(/^按鈕 Dismiss/), '沒有 Dismiss 按鈕')
    check(await grep(UI_RE.buttonStart(UI_TEXT.sourceControlTab)), '沒有 Source Control 按鈕')
    return 'All conflicts resolved + Source Control + Dismiss'
  }
})

defineCase('ED-07', {
  title: 'View all 依 repo 分開,Open in editor 綁 repo',
  pre: 'reset',
  run: async () => {
    await edStart()
    await selectRepo('WebApp')
    await edViewAll(/^按鈕 CHANGES \d/, 2000)
    await selectRepo('api-server')
    await edViewAll(/^按鈕 CHANGES \d/, 2500)
    checkEq((await edTabNames()).filter((x) => x === 'Changes').length, 2, '標題 Changes 的分頁數')
    const api = await grep(/changed files/)
    checkRe(api, /\b2 changed files/, 'api-server combined')
    const copy = await grep(/Help: Copy path/)
    checkRe(copy, /README\.md/, 'api-server 區段應有 README.md')
    checkRe(copy, /server\.ts/, 'api-server 區段應有 server.ts')
    check(!/unstaged-mod|logo\.png|partial/.test(copy), `api-server 分頁混入 WebApp 的檔:${copy}`)
    await edOpenInEditor(/server\.ts, Help: Copy path/)
    check(
      (await edTabNames()).some((x) => /^server\.ts( [MUD])?$/.test(x)),
      '第 3 步沒有開出 server.ts edit 分頁'
    )
    await edClickTab(/^Changes$/, 0)
    const web = await grep(/changed files/)
    // 6:CHANGES 含未追蹤的 Widget.tsx(10-21 起)
    checkRe(web, /\b6 changed files/, 'WebApp combined')
    await selectRepo('WebApp')
    await edViewAll(/^按鈕 STAGED CHANGES/, 2200)
    check((await edTabNames()).includes('Staged Changes'), '第 4 步沒有 Staged Changes 分頁')
    await evidenceShot()
    const rows = await edQ1()
    const r = edQ1Row(rows, 'api-server/server.ts')
    check(
      r && r.rel === 'server.ts' && edIdOf('api-server').test(r.id),
      `Q1 應有 server.ts | api-server/server.ts | <api-server id>:${rows.map((x) => x.raw).join(' ; ')}`
    )
    return `Changes×2(WebApp 6 / api-server 2 files 互不混入);Staged Changes 已開;Q1: ${r.raw} [需看截圖:logo.png 二進位、deleted-unstaged 全紅、partial.ts 只有 index-edit]`
  }
})

defineCase('ED-08.1', {
  title: 'Combined diff 外部改檔後刷新(1/2:開 WebApp Changes)',
  pre: 'reset',
  run: async () => {
    await edStart()
    await selectRepo('WebApp')
    await edViewAll(/^按鈕 CHANGES \d/, 2500)
    check((await edTabNames()).includes('Changes'), '沒有 Changes 分頁')
    await app.scroll([900, 600], 'down', 10)
    await sleep(1000)
    await evidenceShot()
    return 'WebApp Changes 已開並捲到 unstaged-mod 區段附近(截圖);下一段 pre 會 append ext-combined 並記時間'
  }
})
defineCase('ED-08.2', {
  title: 'Combined diff 外部改檔後刷新(2/2:計時)',
  pre: 'script',
  mutates: true,
  run: async () => {
    // Monaco 內容不在 AX,只能截圖;git 端的對照:SC 列的 +N 何時更新
    const t0 = Date.now()
    const shots = []
    for (const at of [5, 15, 30]) {
      await sleep(Math.max(0, at * 1000 - (Date.now() - t0)))
      await evidenceShot()
      shots.push(at)
    }
    check(
      /ext-combined/.test(edRead('WebApp/src/unstaged-mod.ts')),
      '磁碟上沒有 ext-combined(pre 沒跑?)'
    )
    return `已在 ${shots.join('/')} 秒各截一張圖 [需看截圖:unstaged-mod.ts 區段出現 +ext-combined 的時間,<=30s PASS,否則 FAIL(ED-E3)]`
  }
})

defineCase('ED-10', {
  title: 'Committed on Branch 在 linked worktree',
  pre: 'script',
  mutates: true,
  run: async () => {
    await edStart()
    await selectRepo('WebApp-feature')
    if (!(await grep(/^按鈕 COMMITTED ON BRANCH/))) {
      if (await grep(/unavailable/i)) {
        throw new Error('CompareUnavailable(BLOCKED)')
      }
      check(false, 'WebApp-feature 沒有 COMMITTED ON BRANCH 區段')
    }
    await app.click(await rowIn(/^按鈕 COMMITTED ON BRANCH/, /^text staged-mod\.ts/), {
      clickCount: 2
    })
    await sleep(1800)
    check(
      (await edTabNames()).some((x) => x.startsWith('staged-mod.ts (branch diff)')),
      '沒有 staged-mod.ts (branch diff) 分頁'
    )
    await evidenceShot()
    await edViewAll(/^按鈕 COMMITTED ON BRANCH/, 2200)
    const info = await grep(/changed files/)
    checkRe(info, /\b1 changed files\s+vs \S+/, '區段摘要')
    check(
      (await edTabNames()).some((x) => /^Branch Changes \(\S+\)/.test(x)),
      'View all 標題應為 Branch Changes (<base>)'
    )
    await evidenceShot()
    await selectRepo('WebApp')
    check(
      !(await grep(/^按鈕 COMMITTED ON BRANCH/)),
      'WebApp (main) 不該有 COMMITTED ON BRANCH 區段'
    )
    return `${info.replace(/^\d+ /, '')};WebApp (main) 無該區段 [需看截圖:diff 只有 +feature commit line]`
  }
})

defineCase('ED-11.1', {
  title: '綁 repo 的 edit 分頁:外部變更 banner 與 Compare(1/2:打 LOCAL EDIT 不存)',
  pre: 'reset',
  run: async () => {
    await edStart()
    await setAutoSave(false)
    await openMP()
    await selectRepo('WebApp')
    await edDbl(/^text README\.md/, 2000)
    if (await edHasMode('Source')) {
      await edMode('Source')
    }
    await edType('LOCAL EDIT')
    return `README 已打 LOCAL EDIT 未存;分頁:${(await edTabNames()).filter((x) => /README/.test(x)).join(',')}`
  }
})
defineCase('ED-11.2', {
  title: '綁 repo 的 edit 分頁:外部變更 banner 與 Compare(2/2:Compare、Keep My Edits、存檔)',
  pre: 'script',
  mutates: true,
  run: async () => {
    // 視窗不可見時 banner 不會出現(上一輪 Codex 的假 FAIL)
    let b = ''
    for (let k = 0; k < 10 && !b; k++) {
      b = await grep(/changed on disk/)
      if (!b) {
        await sleep(1000)
      }
    }
    checkRe(b, /This file changed on disk while you have unsaved edits/, '第 2 步 banner')
    for (const n of ['Compare', 'Reload from Disk', 'Keep My Edits']) {
      check(await grep(new RegExp(`^按鈕 ${n}`)), `banner 缺按鈕 ${n}`)
    }
    await app.click(await find(/^按鈕 Compare$/))
    await sleep(1800)
    checkRe(await grep(/File changed on disk/), /File changed on disk/, '第 3 步對話框標題')
    checkRe(
      (await grep(/Disk version on the left/)) || '',
      /Disk version on the left, your unsaved edits on the right/,
      '對話框說明'
    )
    await evidenceShot()
    const ks = await findAll(/^按鈕 Keep My Edits/)
    await app.click(ks.at(-1))
    await sleep(800)
    const e = (await lines()).filter(([, t]) => t.startsWith('editor (settable)'))
    await app.click(e.at(-1)[0])
    await app.pressKey('cmd+s')
    await sleep(2500)
    const f = edRead('WebApp/README.md')
    check(/LOCAL EDIT/.test(f), `第 5 步存檔後磁碟沒有 LOCAL EDIT:${JSON.stringify(f.slice(-60))}`)
    check(!/disk edit/.test(f), '第 5 步存檔後磁碟仍有 disk edit')
    return `banner+三按鈕+對話框正確;存檔後磁碟有 LOCAL EDIT、無 disk edit [需看截圖:對話框左 disk edit 右 LOCAL EDIT]`
  }
})
