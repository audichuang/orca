const {
  edRead,
  edTabs,
  edTabNames,
  edClickTab,
  edMode,
  edHasMode,
  edNoDiffError,
  edType,
  edStart,
  edWaitUi,
  edDbl,
  edViewAll,
  edOpenInEditor,
  edOpenFile,
  edQ1,
  edIdOf,
  edQ1Row,
  edConflictRowRe
} = await import(
  new URL(`./ed-editor-actions.mjs${new URL(import.meta.url).search}`, import.meta.url).href
)

// =====================================================================
// SS:重啟後的 session 還原(重啟後的段先單獨 getApp)
// =====================================================================

// 開 4 個 edit 分頁(WebApp/api README、WebApp/feature unstaged-mod)+ 1 個 staged diff,回傳 q1 列
const ssOpenFour = async () => {
  await edStart()
  await edOpenFile('WebApp/README.md')
  await edOpenFile('api-server/README.md')
  await selectRepo('WebApp')
  await edViewAll(/^按鈕 CHANGES \d/)
  await edOpenInEditor(/unstaged-mod\.ts, Help: Copy path/)
  await selectRepo('WebApp-feature')
  await edViewAll(/^按鈕 CHANGES \d/)
  await edOpenInEditor(/unstaged-mod\.ts, Help: Copy path/)
  await selectRepo('WebApp')
  await app.click(await rowIn(/^按鈕 STAGED CHANGES \d/, /^text staged-mod\.ts/), {
    clickCount: 2
  })
  await sleep(1300)
  const names = await edTabNames()
  checkEq(
    names.filter((x) => /^README\.md( [MUD])?$/.test(x)).length,
    2,
    '開完後 README edit 分頁數'
  )
  checkEq(
    names.filter((x) => /^unstaged-mod\.ts( [MUD])?$/.test(x)).length,
    2,
    '開完後 unstaged-mod edit 分頁數'
  )
  check(
    names.some((x) => x.startsWith('staged-mod.ts (staged diff)')),
    '沒有 staged-mod staged diff 分頁'
  )
  // q1 也列 diff 分頁(結尾 | diff),這裡只數 edit 分頁
  const rows = (await edQ1()).filter((r) => !r.raw.endsWith('| diff'))
  checkEq(rows.length, 4, 'Q1 列數')
  check(
    rows.every((r) => r.id !== '-'),
    `Q1 每列都該有 gitWorktreeId:${rows.map((x) => x.raw).join(' ; ')}`
  )
  return rows
}
const ssEditTabs = async () =>
  (await edTabs()).filter((t) => /^(README\.md|unstaged-mod\.ts)( [MUD])?$/.test(t.name))
// 逐一點四個 edit 分頁的 Changes,回傳每個分頁的錯誤訊息並各截一張圖
const ssChangesEach = async (label) => {
  const tabs = await ssEditTabs()
  checkEq(tabs.length, 4, `${label}:edit 分頁數`)
  for (const t of tabs) {
    await app.click(t.id)
    await sleep(1200)
    if (await edHasMode('Changes')) {
      await edMode('Changes')
    }
    await sleep(700)
    await edNoDiffError(`${label} ${t.name}`)
    await evidenceShot()
  }
}
// 只比 edit 分頁:diff 分頁(q1 結尾 | diff)重啟後不還原
const ssSorted = (rows) =>
  rows
    .map((r) => r.raw)
    .filter((raw) => !raw.endsWith('| diff'))
    .sort()
    .join('\n')

defineCase('SS-01.1', {
  title: '綁 repo 的 edit 分頁重啟後還原(1/2:開分頁並記 Q1)',
  pre: 'reset',
  run: async () => {
    await ssOpenFour()
    return `4 個 edit 分頁 + 1 staged diff 已開;Q1 4 列皆有 id(下一段 pre 會存快照後重啟)`
  }
})
defineCase('SS-01.2', {
  title: '綁 repo 的 edit 分頁重啟後還原(2/2:重啟後 Explorer 模式先點 Changes)',
  pre: 'script',
  run: async () => {
    await edWaitUi()
    await app.click(await find(/^(text (Active|Inactive)|container) MultiProduct$/))
    await sleep(1500)
    await app.click(await find(/^按鈕 Explorer/))
    await sleep(1200)
    const names = await edTabNames()
    checkEq(names.filter((x) => x.startsWith('README.md')).length, 2, '重啟後 README edit 分頁數')
    checkEq(
      names.filter((x) => x.startsWith('unstaged-mod.ts')).length,
      2,
      '重啟後 unstaged-mod edit 分頁數'
    )
    check(
      !names.some((x) => /\((staged )?diff\)/.test(x)),
      `diff 分頁不該還原:${names.join(' / ')}`
    )
    await ssChangesEach('第 2 步(Explorer 模式)')
    await app.click(await find(/^按鈕 Source Control/))
    await sleep(1500)
    await ssChangesEach('第 3 步(Source Control)')
    const rows = await edQ1()
    const before = sh('cat "$ROOT/ed-ss01-before.txt"').trim().split('\n').sort().join('\n')
    checkEq(ssSorted(rows), before, '第 4 步 Q1 與重啟前')
    return `4 個 edit 分頁還原、staged diff 未還原;Q1 與重啟前完全相同 [需看截圖:Changes 依序 +webapp readme change、+api readme change、+unstaged-edit、+feature change,第 2 步(Explorer 模式)就要正確]`
  }
})

defineCase('SS-02.1', {
  title: '未存檔草稿:關閉期間磁碟被改(1/2:打 DRAFT 不存)',
  pre: 'reset',
  run: async () => {
    await edStart()
    await setAutoSave(false)
    await openMP()
    // 草稿要打在 edit 分頁:Source Control 雙擊開的 diff 分頁重啟後不還原
    await edOpenFile('WebApp/README.md')
    if (await edHasMode('Source')) {
      await edMode('Source')
    }
    await edType('DRAFT')
    return `README 已打 DRAFT 未存;分頁 ${(await edTabNames()).filter((x) => /README/.test(x)).join(',')}`
  }
})
defineCase('SS-02.2', {
  title: '未存檔草稿:關閉期間磁碟被改(2/2:重啟後)',
  pre: 'script',
  mutates: true,
  run: async () => {
    // pre 以強制結束模擬當機(正常結束會跳「未存檔」對話框,沒有保留草稿選項),確認過 session 有 DRAFT 才改磁碟並重啟
    await edWaitUi()
    await app.click(await find(/^(text (Active|Inactive)|container) MultiProduct$/))
    await sleep(1500)
    check(/offline/.test(edRead('WebApp/README.md')), '磁碟應有 offline')
    await edClickTab(/^README\.md/)
    let b = ''
    for (let k = 0; k < 10 && !b; k++) {
      b = await grep(/changed on disk/)
      if (!b) {
        await sleep(1000)
      }
    }
    checkRe(b, /changed on disk/, '磁碟已變更 banner')
    check(/offline/.test(edRead('WebApp/README.md')), '按按鈕前磁碟應仍有 offline')
    await app.click(await find(/^按鈕 Compare$/))
    await sleep(1800)
    checkRe(await grep(/File changed on disk/), /File changed on disk/, 'Compare 對話框')
    await evidenceShot()
    await app.pressKey('Escape')
    await sleep(500)
    check(/offline/.test(edRead('WebApp/README.md')), '看完 Compare 磁碟仍應有 offline')
    return `README 分頁還原 + banner;磁碟仍有 offline [需看截圖:分頁 dirty 含 DRAFT;Compare 左 offline 右 DRAFT]`
  }
})

defineCase('SS-03.1', {
  title: '舊格式 session(1/3:開分頁確認有 id)',
  pre: 'reset',
  run: async () => {
    await ssOpenFour()
    return '4 個 edit 分頁已開,Q1 皆有 id(下一段 pre 會停止、備份、剝除 gitWorktreeId、重啟)'
  }
})
defineCase('SS-03.2', {
  title: '舊格式 session(2/3:剝掉 id 後啟動)',
  pre: 'script',
  run: async () => {
    await edWaitUi()
    await app.click(await find(/^(text (Active|Inactive)|container) MultiProduct$/))
    await sleep(1500)
    check(
      !(await grep(/corrupt|損毀|Restore profile|profile.*restor/i)),
      `出現 profile 損毀/還原提示:${await grep(/corrupt|損毀|restor/i)}`
    )
    let rows = await edQ1()
    checkEq(rows.length, 4, '第 1 步 Q1 列數')
    check(
      rows.every((r) => r.id === '-'),
      `第 1 步 Q1 最後一欄應全為 -:${rows.map((x) => x.raw).join(' ; ')}`
    )
    await app.click(await find(/^按鈕 Explorer/))
    await sleep(1000)
    await ssChangesEach('第 2 步')
    await app.click(await find(/^按鈕 Source Control/))
    await sleep(1500)
    await selectRepo('WebApp')
    await edDbl(/^text README\.md/, 2000)
    rows = await edQ1()
    // 10-21 起雙擊開的是 diff 分頁(帶 WebApp id);舊格式的 edit 分頁維持 -
    const r = rows.find((x) => x.path === 'WebApp/README.md' && edIdOf('WebApp').test(x.id))
    check(r, `第 3 步 WebApp README 的 id 應又出現:${rows.map((x) => x.raw).join(' ; ')}`)
    return `無損毀提示;4 分頁在,id 全 -;SC 雙擊後 ${r.raw} [需看截圖:第 2 步本機 Changes 仍正確]`
  }
})
defineCase('SS-03.cleanup', {
  title: '舊格式 session(3/3:用備份復原並重啟)',
  pre: 'script',
  mutates: true,
  run: async () => {
    await edWaitUi()
    await app.click(await find(/^(text (Active|Inactive)|container) MultiProduct$/))
    await sleep(1500)
    const rows = await edQ1()
    check(
      rows.length >= 4 && rows.filter((r) => r.id !== '-').length >= 4,
      `復原後 Q1 應回到 4 列有 id:${rows.map((x) => x.raw).join(' ; ')}`
    )
    return '備份已還原,Q1 4 列皆有 id'
  }
})

defineCase('SS-04.1', {
  title: 'gitWorktreeId 指到不存在的 repo(1/3:開分頁確認有 id)',
  pre: 'reset',
  run: async () => {
    await ssOpenFour()
    return '4 個 edit 分頁已開,Q1 皆有 id(下一段 pre 會改成不存在的 id 後重啟)'
  }
})
defineCase('SS-04.2', {
  title: 'gitWorktreeId 指到不存在的 repo(2/3:重啟後)',
  pre: 'script',
  run: async () => {
    await edWaitUi()
    await app.click(await find(/^(text (Active|Inactive)|container) MultiProduct$/))
    await sleep(1500)
    const rows = await edQ1()
    checkEq(rows.length, 4, 'Q1 列數')
    check(
      rows.every((r) => r.id === '-'),
      `Q1 最後一欄應全為 -:${rows.map((x) => x.raw).join(' ; ')}`
    )
    await app.click(await find(/^按鈕 Explorer/))
    await sleep(1000)
    await ssChangesEach('Changes')
    return '正常啟動不 crash,4 分頁在,Q1 id 全 - [需看截圖:Changes 同 SS-03]'
  }
})
defineCase('SS-04.cleanup', {
  title: 'gitWorktreeId 指到不存在的 repo(3/3:用備份復原並重啟)',
  pre: 'script',
  mutates: true,
  run: async () => {
    await edWaitUi()
    await app.click(await find(/^(text (Active|Inactive)|container) MultiProduct$/))
    await sleep(1500)
    const rows = await edQ1()
    check(
      rows.filter((r) => r.id !== '-').length >= 4,
      `復原後 Q1 應回到 4 列有 id:${rows.map((x) => x.raw).join(' ; ')}`
    )
    return '備份已還原,Q1 4 列皆有 id'
  }
})

defineCase('SS-05.1', {
  title: 'linked worktree 在關閉期間被移除(1/3:開分頁)',
  pre: 'reset',
  run: async () => {
    await ssOpenFour()
    return '4 個 edit 分頁已開(下一段 pre 會停止、移除 WebApp-feature worktree、重啟)'
  }
})
defineCase('SS-05.2', {
  title: 'linked worktree 在關閉期間被移除(2/3:重啟後)',
  pre: 'script',
  mutates: true,
  run: async () => {
    await edWaitUi()
    await app.click(await find(/^(text (Active|Inactive)|container) MultiProduct$/))
    await sleep(1500)
    const rows = await edQ1()
    const feat = rows.filter((r) => /WebApp-feature\//.test(r.path))
    const others = rows.filter((r) => !/WebApp-feature\//.test(r.path))
    checkEq(others.length, 3, '其他 3 個分頁的 Q1 列數')
    const names = await edTabNames()
    let feat_note = '(feature 分頁已被丟棄)'
    const featTab = (await edTabs()).filter((t) => t.name.startsWith('unstaged-mod.ts'))[1]
    if (featTab) {
      await app.click(featTab.id)
      await sleep(1500)
      feat_note =
        (await grep(/ENOENT|Unable to load|not found|不存在|Retry/)) || '(分頁在但無錯誤文字)'
      await evidenceShot()
    }
    check(
      names.filter((x) => x.startsWith('README.md')).length === 2,
      `README 分頁應各 1 個:${names.join(' / ')}`
    )
    return `不 crash;其他 3 分頁正常;feature Q1 列: ${feat.length ? feat.map((r) => r.raw).join(';') : '被清掉'};feature 分頁: ${feat_note}`
  }
})
defineCase('SS-05.cleanup', {
  title: 'linked worktree 在關閉期間被移除(3/3:重置後確認 feature/x 回來)',
  pre: 'script',
  mutates: true,
  run: async () => {
    const c = await afterReset()
    check(
      /WebApp-feature \(/.test(c),
      `WebApp-feature 沒回來,需手動 Show in worktree list(P1):${c}`
    )
    return 'WebApp-feature 已回到清單'
  }
})

defineCase('SS-06.1', {
  title: '衝突檔分頁重啟後(1/2:開有 banner 的 index.md)',
  pre: 'script',
  mutates: true,
  run: async () => {
    await edStart()
    await selectRepo('docs-site')
    await edDbl(edConflictRowRe, 2000)
    const b = await grep(/Unresolved conflict · /)
    checkRe(b, /Unresolved conflict/, 'banner')
    const rows = await edQ1()
    const r = edQ1Row(rows, 'docs-site/index.md')
    check(
      r && edIdOf('docs-site').test(r.id),
      `Q1 應有 docs-site 的 id:${rows.map((x) => x.raw).join(' ; ')}`
    )
    return `banner: ${b.replace(/^\d+ /, '')};Q1: ${r.raw}`
  }
})
defineCase('SS-06.2', {
  title: '衝突檔分頁重啟後(2/2:觀察分頁、banner、Q1)',
  pre: 'script',
  mutates: true,
  run: async () => {
    await edWaitUi()
    await app.click(await find(/^(text (Active|Inactive)|container) MultiProduct$/))
    await sleep(1500)
    const tabs = await edTabNames()
    check(
      tabs.some((x) => x.startsWith('index.md')),
      `index.md 分頁應還原:${tabs.join(' / ')}`
    )
    await edClickTab(/^index\.md/)
    const b0 = (await grep(/Unresolved conflict · /)) || '無 banner'
    if (!(await grep(/^按鈕 Refresh all repositories/))) {
      await app.click(await find(/^按鈕 Source Control/))
      await sleep(1500)
    }
    await selectRepo('docs-site')
    const b1 = (await grep(/Unresolved conflict · /)) || '無 banner'
    await edDbl(edConflictRowRe, 2000)
    const b2 = (await grep(/Unresolved conflict · /)) || '無 banner'
    const rows = await edQ1()
    const r = edQ1Row(rows, 'docs-site/index.md')
    check(
      r && edIdOf('docs-site').test(r.id),
      `Q1 應有 docs-site 的 id:${rows.map((x) => x.raw).join(' ; ')}`
    )
    return `分頁還原;banner 重啟後: ${b0.replace(/^\d+ /, '')} / 選 docs-site 後: ${b1.replace(/^\d+ /, '')} / 重新雙擊後: ${b2.replace(/^\d+ /, '')};Q1: ${r.raw}(觀察案例,預期前兩者無 banner、最後有)`
  }
})
