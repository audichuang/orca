import fs from 'node:fs'

const { rsTop, rsResultIs, rsSimple } = await import(
  new URL(`./rs-restore-dialog.mjs${new URL(import.meta.url).search}`, import.meta.url).href
)

defineCase('RS-01', {
  title: '從一般 repo 複製、在 folder 還原(加一層)',
  pre: 'script',
  mutates: true,
  run: async () => {
    await afterReset()
    const rows = await findAll(/^text (Active|Inactive) main primary main/)
    check(rows.length >= 2, `找不到 WebApp main workspace 列(${rows.length})`)
    await app.click(rows[1])
    await sleep(2000)
    const sc = (await lines()).find(([, t]) => t.startsWith('按鈕 Source Control'))
    if (sc && !(await grep(/^按鈕 STAGED CHANGES/))) {
      await app.click(sc[0])
      await sleep(1500)
    }
    const c = await copyAndRead(async () => {
      await app.click(await btnAfter(/^按鈕 STAGED CHANGES/, /^按鈕 Copy Full Source/))
      await sleep(1200)
      return await note()
    })
    checkEq(
      c.clip,
      fs.readFileSync(`${rsTop()}/payloads/RS-01-ref`, 'utf8'),
      'STAGED 複製內容(對照 payloads/RS-01-ref)'
    )
    await app.click(await find(/^text (Active|Inactive) MultiProduct/))
    await sleep(1500)
    await openMP()
    const r = await rsRun({ toggleAdjust: true, overwrite: true })
    check(
      r.first.adjust?.label === 'WebApp/' && r.first.adjust.on,
      `Adjust 勾選框實際 ${JSON.stringify(r.first.adjust)}`
    )
    rsExpect('勾選時', r.first, {
      Overwrite: ['WebApp/src/new-name.ts', 'WebApp/src/partial.ts', 'WebApp/src/staged-mod.ts'],
      Skip: ['WebApp/src/deleted-staged.ts :: already absent']
    })
    check(r.disabledBefore, '未勾覆蓋前 Restore 應停用')
    check(r.toggled, '取消勾選的預覽沒讀到')
    check(
      JSON.stringify(r.toggled.g.Create?.items.slice().sort()) ===
        JSON.stringify(['src/new-name.ts', 'src/partial.ts', 'src/staged-mod.ts']) &&
        r.toggled.g.Create.n === 3,
      `取消勾選應 Create (3) src/*.ts,實際 ${r.toggled.raw.slice(0, 200)}`
    )
    rsResultIs(r, 'Created 0, overwritten 3, deleted 0, skipped 1.', 'Restore')
    checkEq(rsRead('WebApp/src/partial.ts'), 'partial\nline2\nline3\nindex-edit', 'partial.ts')
    check(!rsEx(`${P}/src`), '不該出現 MultiProduct/src')
    return '複製=RS-01-ref;Adjust(WebApp/)預設勾,Overwrite 3+Skip 1,取消勾變 Create 3;Overwritten 3,partial.ts 正確,無 src/'
  }
})

defineCase('RS-02', {
  title: '去掉一層(strip)',
  pre: 'script',
  mutates: true,
  run: async () => {
    await afterReset()
    const r = await rsRun({ toggleAdjust: true, overwrite: true })
    check(
      r.first.adjust?.label === 'MultiProduct/' && r.first.adjust.on,
      `Adjust 實際 ${JSON.stringify(r.first.adjust)}`
    )
    rsExpect('勾選時', r.first, { Overwrite: ['api-server/README.md'] })
    check(r.toggled, '取消勾選的預覽沒讀到')
    rsExpect('取消勾選', r.toggled, { Create: ['MultiProduct/api-server/README.md'] })
    rsResultIs(r, 'Created 0, overwritten 1, deleted 0, skipped 0.', 'Restore')
    checkEq(rsRead('api-server/README.md'), '# api\nstrip ok', 'README')
    check(!rsEx(`${P}/MultiProduct`), '不該出現 MultiProduct/MultiProduct')
    return 'Adjust(MultiProduct/)勾→Overwrite 1;取消→Create MultiProduct/api-server/README.md;還原後內容正確'
  }
})

defineCase('RS-03a', {
  title: '沒有 root 行',
  pre: 'script',
  mutates: true,
  run: async () => {
    await rsSimple('RS-03a', ['notes/no-root.txt'])
    checkEq(rsRead('notes/no-root.txt'), 'no root line', 'no-root.txt')
    return '無 Adjust,Create 1,內容 "no root line"'
  }
})

defineCase('RS-03b', {
  title: 'root 對不上',
  pre: 'script',
  mutates: true,
  run: async () => {
    await rsSimple('RS-03b', ['notes/bad-root.txt'])
    checkEq(rsRead('notes/bad-root.txt'), 'bad root', 'bad-root.txt')
    return '無 Adjust,Create 1,內容 "bad root"'
  }
})

defineCase('RS-04', {
  title: '首尾空白行',
  pre: 'script',
  mutates: true,
  run: async () => {
    await rsSimple('RS-04', ['notes/ws.txt'])
    checkEq(
      rsRead('notes/ws.txt'),
      '  indented first\nmiddle\n\nlast line with trailing spaces   ',
      'ws.txt'
    )
    return 'Create 1,位元組與預期相同(首行縮排、行尾空白保留,首尾空行修掉)'
  }
})

defineCase('RS-05', {
  title: 'CRLF 與單獨 CR',
  pre: 'script',
  mutates: true,
  run: async () => {
    await rsSimple(
      'RS-05',
      ['notes/crlf.txt', 'notes/cr.txt'],
      'Created 2, overwritten 0, deleted 0, skipped 0.'
    )
    checkEq(rsRead('notes/crlf.txt'), 'l1\nl2', 'crlf.txt')
    checkEq(rsRead('notes/cr.txt'), 'x\ry', 'cr.txt')
    return 'Create 2;crlf.txt=l1\\nl2,cr.txt=x\\ry'
  }
})

defineCase('RS-06', {
  title: '空內容',
  pre: 'script',
  mutates: true,
  run: async () => {
    await rsSimple(
      'RS-06',
      ['notes/empty.txt', 'notes/blank-only.txt'],
      'Created 2, overwritten 0, deleted 0, skipped 0.'
    )
    checkEq(rsRead('notes/empty.txt'), '', 'empty.txt')
    checkEq(rsRead('notes/blank-only.txt'), '', 'blank-only.txt')
    return 'Create 2,兩檔皆 0 bytes'
  }
})

defineCase('RS-07', {
  title: '各種刪除情境',
  pre: 'script',
  mutates: true,
  run: async () => {
    await afterReset()
    const r = await rsRun()
    rsExpect('RS-07', r.first, {
      Delete: ['docs-site/index.md'],
      Skip: [
        'WebApp/src :: is a folder',
        'notes/missing.txt :: already absent',
        'WebApp/outside-link/MultiProduct/notes/todo.txt :: path goes through a symlink',
        'WebApp/git-alias/HEAD :: path goes through a symlink'
      ]
    })
    rsResultIs(r, 'Created 0, overwritten 0, deleted 1, skipped 4.', 'Restore')
    check(!rsEx(`${P}/docs-site/index.md`), 'docs-site/index.md 應被刪')
    check(rsEx(`${P}/WebApp/src`), 'WebApp/src 應還在')
    rsShaOk(`${rsTop()}/RS-07.sha`, 'todo.txt / .git/HEAD')
    return 'Delete 1 + Skip 4(folder/absent/symlink×2),Deleted 1 skipped 4;index.md 不見,src 在,兩個 sha 不變'
  }
})

defineCase('RS-08', {
  title: '路徑安全規則',
  pre: 'script',
  mutates: true,
  run: async () => {
    await afterReset()
    const r = await rsRun()
    rsExpect('RS-08', r.first, {
      Create: [
        'docs-site/.gitignore',
        'notes/dot.txt',
        'notes/back/slash.txt',
        'notes/double/slash.txt'
      ],
      Skip: [
        '.GIT/hooks/pre-commit :: .git is protected',
        'WebApp/.Git/config :: .git is protected',
        'notes/a:b.txt :: unsafe path',
        'notes/what?.txt :: unsafe path',
        'notes/sub/../../../escape2.txt :: unsafe path'
      ]
    })
    rsResultIs(r, 'Created 4, overwritten 0, deleted 0, skipped 5.', 'Restore')
    rsShaOk(`${rsTop()}/RS-08.sha`, 'WebApp/.git/config')
    check(!rsEx(`${rsTop()}/escape2.txt`), '<root>/escape2.txt 不該存在')
    check(!rsEx(`${P}/.GIT`), 'MultiProduct/.GIT 不該存在')
    return 'Create 4 + Skip 5(.git×2、unsafe×3),Created 4 skipped 5;.git/config 不變,escape2.txt 不存在'
  }
})

defineCase('RS-09', {
  title: '絕對路徑(含 Windows 風格)',
  pre: 'script',
  mutates: true,
  run: async () => {
    await afterReset()
    const r = await rsRun()
    rsExpect('RS-09', r.first, {
      Create: ['notes/abs-inside.txt', 'notes/abs-cross.txt', 'notes/abs-win.txt'],
      Skip: [
        '/home/bob/work/multiproduct/notes/abs-lower.txt :: outside the folder',
        '/a/MultiProduct/b/MultiProduct/c.txt :: outside the folder',
        '/home/bob/MultiProduct/../etc/abs-dotdot.txt :: outside the folder',
        '/tmp/orca-ui-unmatched.txt :: outside the folder'
      ]
    })
    rsResultIs(r, 'Created 3, overwritten 0, deleted 0, skipped 4.', 'Restore')
    check(!rsEx('/tmp/orca-ui-unmatched.txt'), '/tmp/orca-ui-unmatched.txt 不該存在')
    return 'Create 3(inside/cross/win)+ Skip 4 outside the folder;Created 3 skipped 4;/tmp 檔不存在'
  }
})

defineCase('RS-10', {
  title: '大小寫不同的 symlink 與路徑',
  pre: 'script',
  mutates: true,
  run: async () => {
    const counts0 = await afterReset()
    if (!rsEx(`${P}/WEBAPP`)) {
      throw new Error('檔案系統區分大小寫(WEBAPP 不存在),此案不適用')
    }
    const r = await rsRun({ overwrite: true })
    rsExpect('RS-10', r.first, {
      Overwrite: ['WEBAPP/README.md'],
      Skip: ['WebApp/GIT-ALIAS/config :: path goes through a symlink']
    })
    rsResultIs(r, 'Created 0, overwritten 1, deleted 0, skipped 1.', 'Restore')
    rsShaOk(`${rsTop()}/RS-10.sha`, 'WebApp/.git/config')
    checkEq(rsRead('WebApp/README.md'), 'case insensitive overwrite', 'README')
    const before = /WebApp \(main\) (\d+)/.exec(counts0)?.[1]
    let c = ''
    for (let k = 0; k < 6; k++) {
      c = await counts()
      if (/WebApp \(main\) 10/.test(c)) {
        break
      }
      await sleep(1000)
    }
    checkRe(c, /WebApp \(main\) 10/, '清單 WebApp 數字(README 本來就是 M,維持 10)')
    return `Overwrite 1 + Skip 1 symlink;Overwritten 1 skipped 1;.git/config 不變;README 正確;WebApp ${before}→10`
  }
})

defineCase('RS-11', {
  title: '重複路徑與 MOVED',
  pre: 'script',
  mutates: true,
  run: async () => {
    const counts0 = await afterReset()
    checkRe(counts0, /WebApp \(main\) 10/, '起始 WebApp 計數')
    const r = await rsRun()
    rsExpect('RS-11', r.first, { Create: ['notes/dup.txt', 'WebApp/src/moved-here.ts'] })
    rsResultIs(r, 'Created 2, overwritten 0, deleted 0, skipped 0.', 'Restore')
    checkEq(rsRead('notes/dup.txt'), 'second', 'dup.txt')
    checkEq(rsRead('WebApp/src/new-name.ts'), 'old-name\nline2\nline3\n', 'new-name.ts 不受影響')
    let c = ''
    for (let k = 0; k < 8; k++) {
      c = await counts()
      if (/WebApp \(main\) 11/.test(c)) {
        break
      }
      await sleep(1000)
    }
    checkRe(c, /WebApp \(main\) 11/, 'WebApp 計數 10→11')
    return 'Create 2;dup.txt=second;new-name.ts 不變;WebApp 10→11'
  }
})

defineCase('RS-12', {
  title: '佔位內容(CC-E2)',
  pre: 'script',
  mutates: true,
  run: async () => {
    await afterReset()
    const r = await rsRun({ overwrite: true })
    const why = 'content was skipped when copied'
    rsExpect('RS-12', r.first, {
      Skip: [
        `api-server/README.md :: ${why}`,
        `api-server/server.ts :: ${why}`,
        `libs/shared/core/core.ts :: ${why}`,
        `notes/two-line-placeholder.txt :: ${why}`
      ]
    })
    check(
      r.cancelled && (r.disabledBefore || r.disabledAfterOverwrite),
      `Restore 應停用,實際 result=${r.result}`
    )
    rsShaOk(`${rsTop()}/RS-12.sha`, 'README/server.ts/core.ts')
    check(!rsEx(`${P}/notes/two-line-placeholder.txt`), 'two-line-placeholder.txt 不該建立')
    return 'Skip 4 全為 content was skipped when copied,Restore 停用;三檔 sha 不變,two-line-placeholder 未建立'
  }
})

defineCase('RS-13', {
  title: '只有覆蓋項時 Restore 停用',
  pre: 'script',
  mutates: true,
  run: async () => {
    await afterReset()
    const r = await rsRun({ overwrite: true })
    rsExpect('RS-13', r.first, { Overwrite: ['libs/shared/core/extra.ts'] })
    check(r.disabledBefore, '未勾覆蓋時 Restore 應停用')
    check(!r.disabledAfterOverwrite, '勾覆蓋後 Restore 應可按')
    rsResultIs(r, 'Created 0, overwritten 1, deleted 0, skipped 0.', 'Restore')
    checkEq(rsRead('libs/shared/core/extra.ts'), 'overwrite only', 'extra.ts')
    return 'Overwrite 1;未勾停用、勾後可按;Overwritten 1;extra.ts="overwrite only"'
  }
})

// RS-14:預覽後磁碟才變動。.1 開預覽不關;Bash 跑 pre/<ID>.2.sh 動磁碟;.2 按 Restore
for (const [id, path, _want, verify] of [
  [
    'RS-14a',
    'notes/stale.txt',
    null,
    () =>
      check(
        rsRead('notes/stale.txt').trim() === 'external',
        `stale.txt 應仍是 external,實際 ${JSON.stringify(rsRead('notes/stale.txt'))}`
      )
  ],
  [
    'RS-14b',
    'notes/sub2/x.txt',
    null,
    () => check(!rsEx(`${rsTop()}/x.txt`), '<root>/x.txt 不該存在')
  ]
]) {
  defineCase(`${id}.1`, {
    title: `${id} 第 1 段:開預覽`,
    pre: 'script',
    mutates: true,
    run: async () => {
      await afterReset()
      const v = await rsOpenPreview()
      rsExpect(`${id}.1`, v, { Create: [path] })
      return `預覽 Create (1) ${path},對話框保持開啟(接著跑 pre/${id}.2.sh 再跑 ${id}.2)`
    }
  })
  defineCase(`${id}.2`, {
    title: `${id} 第 2 段:磁碟變動後 Restore`,
    // raw:預覽對話框還開著,先打開 MultiProduct 會在對話框下找不到左側欄
    pre: 'script',
    mutates: true,
    raw: true,
    run: async () => {
      const v = await rsView()
      check(v.open, '對話框已不在(.1 沒留著?)')
      const result = await rsClickRestore()
      check(
        result.includes('Created 0, overwritten 0, deleted 0, skipped 1.'),
        `通知實際 ${result.slice(0, 200)}`
      )
      verify()
      return `Restore → Created 0 … skipped 1;${id === 'RS-14a' ? 'stale.txt 仍是 external' : 'x.txt 未寫出 symlink 外'}`
    }
  })
}

defineCase('RS-15', {
  title: '父層是檔案(CC-E7)',
  pre: 'script',
  mutates: true,
  run: async () => {
    await afterReset()
    const r = await rsRun()
    if (!r.first.open) {
      throw new Error(`沒有預覽(舊行為:整批失敗)。通知:${r.note}`)
    }
    rsExpect('RS-15', r.first, {
      Create: ['notes/enotdir-ok.txt'],
      Skip: ['WebApp/README.md/child.ts']
    })
    const reason = r.first.g.Skip.items[0].reason
    rsResultIs(r, 'Created 1, overwritten 0, deleted 0, skipped 1.', 'Restore')
    checkEq(rsRead('notes/enotdir-ok.txt'), 'ok', 'enotdir-ok.txt')
    return `Create 1 + Skip 1(原因 "${reason}");Created 1 skipped 1;enotdir-ok.txt 已建立`
  }
})

defineCase('RS-16', {
  title: '未 escape 的標頭多分一檔;escape 的不會',
  pre: 'script',
  mutates: true,
  run: async () => {
    await afterReset()
    const r = await rsRun()
    rsExpect('RS-16', r.first, {
      Create: ['notes/phantom-a.txt', 'notes/phantom-b.txt', 'notes/escaped.txt']
    })
    rsResultIs(r, 'Created 3, overwritten 0, deleted 0, skipped 0.', 'Restore')
    checkEq(rsRead('notes/phantom-a.txt'), 'line one', 'phantom-a')
    checkEq(rsRead('notes/phantom-b.txt'), 'line two', 'phantom-b')
    checkEq(rsRead('notes/escaped.txt'), '// file: notes/not-a-file.txt\nkept', 'escaped')
    check(!rsEx(`${P}/notes/not-a-file.txt`), 'not-a-file.txt 不該存在')
    return 'Create 3;phantom-a/b 內容正確;escaped.txt 還原出 // file: 行;not-a-file 不存在'
  }
})

defineCase('RS-17', {
  title: '不認得、小寫、相連的標籤',
  pre: 'script',
  mutates: true,
  run: async () => {
    await afterReset()
    const r = await rsRun()
    rsExpect('RS-17', r.first, {
      Create: ['[RENAMED] notes/r.txt', '[new] notes/n.txt', 'notes/multi.txt']
    })
    rsResultIs(r, 'Created 3, overwritten 0, deleted 0, skipped 0.', 'Restore')
    check(rsEx(`${P}/[RENAMED] notes/r.txt`), '應有資料夾 "[RENAMED] notes"')
    check(rsEx(`${P}/[new] notes/n.txt`), '應有資料夾 "[new] notes"')
    check(rsEx(`${P}/notes/multi.txt`), 'notes/multi.txt 應存在')
    return 'Create 3;出現 "[RENAMED] notes"、"[new] notes" 資料夾,multi.txt 在 notes/'
  }
})

defineCase('RS-18a', {
  title: '各種標頭寫法',
  pre: 'script',
  mutates: false,
  run: async () => {
    await afterReset()
    const r = await rsRun({ restore: false })
    rsExpect('RS-18a', r.first, {
      Create: [
        'notes/bare.txt',
        'notes/hash.txt',
        'notes/block.txt',
        'notes/upper.txt',
        'notes/spaced.txt'
      ]
    })
    check(r.first.adjust === null, '不該有 Adjust 勾選框')
    return '無 Adjust,Create 5(bare/hash/block/upper/spaced);已取消不還原'
  }
})

// 18b/18c 沒有預覽對話框,只有錯誤通知
const rsNoDialog = async (re, label) => {
  await afterReset()
  const v = await rsOpenPreview()
  const n = await note()
  checkRe(n, re, label)
  check(!v.open, `${label}: 不該開出預覽對話框`)
  return n.replace(/^\d+ (文字|text) /, '')
}
defineCase('RS-18b', {
  title: '沒有標頭',
  pre: 'script',
  run: async () =>
    `通知:${await rsNoDialog(/No Snipcode file headers found in clipboard\./, 'RS-18b')}`
})
defineCase('RS-18c', {
  title: '只有空白',
  pre: 'script',
  run: async () =>
    `通知:${await rsNoDialog(/Clipboard is empty or does not contain text\./, 'RS-18c')}`
})

defineCase('RS-19', {
  title: 'Unicode 檔名',
  pre: 'script',
  mutates: true,
  run: async () => {
    await afterReset()
    const r = await rsRun()
    rsExpect('RS-19', r.first, { Create: ['notes/中文 檔名.md'] })
    rsResultIs(r, 'Created 1, overwritten 0, deleted 0, skipped 0.', 'Restore')
    checkEq(rsRead('notes/中文 檔名.md'), '你好，世界 👍\ncafé', 'Unicode 內容')
    return 'Create 1 notes/中文 檔名.md;位元組相同'
  }
})

defineCase('RS-20', {
  title: '寫入失敗',
  pre: 'script',
  mutates: true,
  run: async () => {
    await afterReset()
    const r = await rsRun()
    rsExpect('RS-20', r.first, { Create: ['notes/locked/x.txt'] })
    rsResultIs(r, 'Created 0, overwritten 0, deleted 0, skipped 0. Failed 1.', 'Restore')
    let detail = ''
    for (let k = 0; k < 5 && !detail; k++) {
      detail = await grep(/locked\/x\.txt:/)
      if (!detail) {
        await sleep(500)
      }
    }
    check(detail, '找不到 "notes/locked/x.txt: <錯誤>" 的說明')
    check(!rsEx(`${P}/notes/locked/x.txt`), 'x.txt 不該被建立')
    return `Failed 1;說明:${detail.replace(/^\d+ (文字|text) /, '').replace(`${ROUND.root}/`, '<root>/')}`.slice(
      0,
      149
    )
  }
})
defineCase('RS-20.cleanup', {
  title: 'RS-20 結束:還原 locked 權限',
  pre: 'script',
  run: async () => {
    const ls = sh(`ls -ld "$P/notes/locked"`)
    checkRe(ls, /^drwxr-xr-x/, 'locked 權限應已 chmod 755')
    return 'locked 已是 755'
  }
})

defineCase('RS-21', {
  title: '一般 repo workspace 的 tab 有未存檔編輯',
  pre: 'script',
  mutates: true,
  run: async () => {
    await afterReset()
    // 橫幅只在有未存檔編輯時出現;profile 可能留著上一輪開的 Auto Save
    await setAutoSave(false)
    const rows = async () => await findAll(/^text (Active|Inactive) main primary main/)
    await app.click((await rows())[1])
    await sleep(2000)
    const sc = (await lines()).find(([, t]) => t.startsWith('按鈕 Source Control'))
    if (sc && !(await grep(/^按鈕 CHANGES/))) {
      await app.click(sc[0])
      await sleep(1500)
    }
    // 雙擊變更列開的是 diff 分頁,Open file 才是可編輯的檔案分頁
    await app.click(await find(/^text README\.md/), { clickCount: 2 })
    await sleep(2000)
    await app.click(await find(UI_RE.button(UI_MAP.UI_TEXT.openFile)))
    await sleep(1500)
    const ed = (await lines()).find(([, t]) => /^圓形按鈕 (Description: )?Source/.test(t))
    if (ed) {
      await app.click(ed[0])
      await sleep(1000)
    }
    const e = (await lines()).filter(([, t]) => t.startsWith('editor (settable)'))
    check(e.length, '找不到編輯器(Edit 模式)')
    await app.click(e.at(-1)[0])
    await app.pressKey('cmd+Down')
    await app.typeText('TYPED-IN-REPO-TAB')
    await sleep(500)
    await app.click(await find(/^text (Active|Inactive) MultiProduct/))
    await sleep(1500)
    await openMP()
    const r = await rsRun({ overwrite: true })
    rsExpect('RS-21', r.first, { Overwrite: ['WebApp/README.md'] })
    rsResultIs(r, 'Created 0, overwritten 1, deleted 0, skipped 0.', 'Restore')
    await sleep(15000)
    checkEq(rsRead('WebApp/README.md'), 'restored over repo tab', '15 秒後磁碟')
    await app.click((await rows())[1])
    await sleep(2000)
    const banner = await grep(/changed on disk|Reload from Disk|Keep My Edits|Compare/)
    checkRe(banner, /This file changed on disk while you have unsaved edits/, 'WebApp 分頁橫幅')
    checkRe(banner, /Compare/, 'Compare 按鈕')
    checkRe(banner, /Reload from Disk/, 'Reload from Disk 按鈕')
    checkRe(banner, /Keep My Edits/, 'Keep My Edits 按鈕')
    checkEq(rsRead('WebApp/README.md'), 'restored over repo tab', '看橫幅時磁碟')
    await app.click(await find(/^按鈕 Reload from Disk/))
    await sleep(1200)
    check(!(await grep(/Keep My Edits/)), '按 Reload from Disk 後橫幅應消失')
    await closeAll()
    return '未存編輯後 folder 還原 Overwritten 1;磁碟維持 restored over repo tab;WebApp 分頁出現 changed on disk 橫幅(3 按鈕),已 Reload'
  }
})

defineCase('RS-22', {
  title: '同名子資料夾不多加一層(CC-E4,修正後)',
  pre: 'script',
  run: async () => {
    await afterReset()
    const r = await rsRun({ toggleAdjust: true, restore: false })
    check(r.first.open, `沒有預覽:${r.note}`)
    // 修正後:預設的預覽必須是覆蓋 notes/todo.txt,不得出現 notes/notes/todo.txt
    rsExpect('RS-22 預設', r.first, { Overwrite: ['notes/todo.txt'] })
    return `預設 ${rsBrief(r.first)} notes/todo.txt(Adjust ${r.first.adjust ? `(${r.first.adjust.label}) ${r.first.adjust.on ? '勾' : '未勾'}` : '無'});切換後 ${r.toggled ? r.toggled.raw.slice(0, 80) : '無切換'};已取消`
  }
})
