const { edTabNames, edNoDiffError, edStart, edDbl } = await import(
  new URL(`./ed-editor-actions.mjs${new URL(import.meta.url).search}`, import.meta.url).href
)

// =====================================================================
// MD:main 端 diff(missingSides)
// =====================================================================

defineCase('MD-01', {
  title: '新增/刪除檔 diff 沒有退化',
  pre: 'reset',
  run: async () => {
    await edStart()
    await selectRepo('WebApp')
    for (const [re, tab] of [
      [/^text Widget\.tsx/, /^Widget\.tsx \(diff\)/],
      [/^text deleted-unstaged\.ts/, /^deleted-unstaged\.ts \(diff\)/],
      [/^text deleted-staged\.ts/, /^deleted-staged\.ts \(staged diff\)/],
      [/^text logo\.png/, /^logo\.png/]
    ]) {
      const r = (await lines()).find(([, t]) => re.test(t))
      check(r, `找不到列 ${re}`)
      await app.click(r[0], { clickCount: 2 })
      await sleep(1800)
      await edNoDiffError(String(re))
      check(
        (await edTabNames()).some((x) => tab.test(x)),
        `沒開出分頁 ${tab}:${(await edTabNames()).join(' / ')}`
      )
      await evidenceShot()
    }
    return '4 個 diff 分頁都開出且無 Error loading diff [需看截圖:Widget 左空右全新增、兩個 deleted 全紅、logo.png 走二進位/圖片 diff]'
  }
})

defineCase('MD-02', {
  title: '空檔與刪除檔可分辨',
  pre: 'script',
  mutates: true,
  run: async () => {
    await edStart()
    await selectRepo('WebApp')
    await edDbl(/^text empty-new\.ts/, 1800)
    await edNoDiffError('empty-new')
    check(
      (await edTabNames()).some((x) => x.startsWith('empty-new.ts')),
      '沒開出 empty-new.ts 分頁'
    )
    await evidenceShot()
    await selectRepo('docs-site')
    const row = await grep(/^text index\.md/)
    check(row.endsWith('M') && !row.endsWith('D'), `index.md 狀態應為 M(不是 D):${row}`)
    await edDbl(/^text index\.md/, 1800)
    await edNoDiffError('index.md')
    // Markdown 以 edit 分頁的 Changes 模式開啟,沒有 Open file 按鈕;本身就能編輯
    const o = (await grep(/Open file/)) || (await grep(/^圓形按鈕 Description: Changes, Value: 1/))
    check(
      o && !/disabled/.test(o),
      `index.md 應可開啟編輯(Open file 或 edit 分頁 Changes 模式):${o}`
    )
    await evidenceShot()
    return `index.md 列: ${row.replace(/^\d+ /, '')};Open file: ${o.replace(/^\d+ /, '')} [需看截圖:empty-new 空 diff;index.md diff 為 -docs]`
  }
})

defineCase('MD-03', {
  title: '二進位檔被刪除',
  pre: 'script',
  mutates: true,
  run: async () => {
    await edStart()
    await selectRepo('WebApp')
    const row = await grep(/^text logo\.png/)
    check(row.endsWith('D'), `logo.png 應為 D:${row}`)
    await edDbl(/^text logo\.png/, 2000)
    await edNoDiffError('logo.png')
    const o = await grep(/Open file/)
    checkRe(o, /disabled/, 'Open file 應停用')
    await evidenceShot()
    return `logo.png 列: ${row.replace(/^\d+ /, '')};Open file 停用 [需看截圖:顯示已刪除的二進位/圖片(Original 側 Failed to load file preview 是 fixture 假 png,可接受),不是讀取錯誤]`
  }
})

defineCase('MD-04', {
  title: '直接查 IPC(missingSides)',
  pre: 'script',
  run: async () => {
    // pre/MD-04.sh 用 CDP 從 Bash 端呼叫 window.api.git.diff,結果在 md04-result.json
    const res = JSON.parse(sh('cat "$ROOT/md04-result.json"'))
    if (res.value === 'NO_API') {
      throw new Error('window.api.git.diff 不存在(BLOCKED)')
    }
    const v = res.value
    check(Array.isArray(v) && v.length === 7, `結果格式不對:${JSON.stringify(res).slice(0, 200)}`)
    const exp = ['["original"]', '["modified"]', '["modified"]', '["original"]', null, null]
    exp.forEach((m, i) =>
      checkEq(String(v[i][3] ?? null), String(m), `第 ${i + 1} 列 ${v[i][0]} 的 missingSides`)
    ) // checkEq 拒收 null,轉成字串比
    checkEq(v[6][2], 'ERR', '最後一列(以 folder 根為 worktree)')
    checkRe(v[6][3], /unknown repository or worktree path/, '最後一列錯誤訊息')
    return v
      .map((r) => `${r[0].split('/').pop()}:${r[2] === 'ERR' ? 'ERR' : (r[3] ?? 'undefined')}`)
      .join(' ')
  }
})
