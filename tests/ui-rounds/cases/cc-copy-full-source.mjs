const {
  ROOT,
  rowInSection,
  ccNote,
  ccRowCopy,
  ccSecCopy,
  ccCtxCopy,
  ccRefresh,
  ccSelect,
  ccStat,
  ccWorktreeRow,
  ccEnsureSourceControl,
  ccOtherLocations,
  W_PARTIAL
} = await import(
  new URL(`./cc-copy-actions.mjs${new URL(import.meta.url).search}`, import.meta.url).href
)

defineCase('CC-01', {
  title: 'api-server repo 列逐字',
  pre: 'reset',
  run: async () => {
    const r = await copyAndRead(() => rowCopy(/^按鈕 api-server \(main\)/))
    checkRe(
      r.note,
      /2 Git file\(s\) copied\. 181 chars · 16 lines · 24 words · ~28 tokens\./,
      '通知'
    )
    checkEq(
      r.clip,
      `${ROOT}\n// file: [MODIFIED] api-server/README.md\n# api\nbase\napi readme change\n\n\n// file: [MODIFIED] api-server/server.ts\nbase\nlocal 1\nlocal 2\nunstaged api\n\n\n`,
      '剪貼簿'
    )
    return r.note.replace(/^\d+ 文字 /, '')
  }
})

defineCase('CC-02', {
  title: '單列右鍵:工作區 vs index,兩種間距',
  pre: 'reset',
  run: async () => {
    await clickRe(/^按鈕 WebApp \(main\)/)
    const r1 = await copyAndRead(async () =>
      ctxCopy(await rowInSection(/^按鈕 CHANGES \d/, /^text partial\.ts src/))
    )
    checkEq(
      r1.clip,
      `${ROOT}\n// file: [MODIFIED] WebApp/src/partial.ts\npartial\nline2\nline3\nindex-edit\nworktree-edit\n\n\n`,
      '第 1 步'
    )
    const r2 = await copyAndRead(async () =>
      ctxCopy(await rowInSection(/^按鈕 STAGED CHANGES \d/, /^text partial\.ts src/))
    )
    checkEq(
      r2.clip,
      `${ROOT}// file: [MODIFIED] WebApp/src/partial.ts\npartial\nline2\nline3\nindex-edit\n\n`,
      '第 2 步'
    )
    return `${statsOf(r1.clip)} / ${statsOf(r2.clip)}`
  }
})
defineCase('CC-03', {
  title: '同路徑兩區都選:只留工作區版本',
  pre: 'reset',
  run: async () => {
    await openMP()
    await ccSelect(/^按鈕 WebApp \(main\)/, /^text partial\.ts src/)
    await app.click(await rowInSection(/^按鈕 STAGED CHANGES \d/, /^text partial\.ts src/), {
      key: 'cmd'
    })
    await sleep(500)
    await app.click(await rowInSection(/^按鈕 CHANGES \d/, /^text partial\.ts src/), { key: 'cmd' })
    await sleep(600)
    check(await grep(/^text 2 selected/), '多選後沒有「2 selected」')
    const r = await copyAndRead(async () => {
      await app.click(await btnAfter(/^text \d+ selected/, /^按鈕 Copy Full Source/, 10))
      await sleep(1300)
      const n = await ccNote()
      const cl = await findAll(/^按鈕 Clear selection/)
      if (cl.length) {
        await app.click(cl[0])
      }
      return n
    })
    checkEq(r.clip, W_PARTIAL, '剪貼簿')
    checkRe(
      r.note,
      /1 Git file\(s\) copied\. 121 chars · 11 lines · 12 words · ~14 tokens\./,
      '通知'
    )
    return '2 selected,只複製 1 個工作區版本,121/11/12/14'
  }
})

defineCase('CC-04', {
  title: 'CHANGES 區段複製,未追蹤檔排在最後',
  pre: 'reset',
  run: async () => {
    await openMP()
    await ccSelect(/^按鈕 WebApp \(main\)/, /^text partial\.ts src/)
    // 10-21 起 UNTRACKED FILES 併進 CHANGES,區段複製把未追蹤檔接在已追蹤檔之後
    const r1 = await copyAndRead(() => ccSecCopy(/^按鈕 CHANGES \d/))
    checkEq(
      r1.clip,
      `${ROOT}// file: [MODIFIED] WebApp/README.md\n# WebApp\nbase readme\nwebapp readme change\n\n\n// file: [DELETED] WebApp/src/deleted-unstaged.ts\ndeleted-unstaged\nline2\nline3\n\n\n// file: [MODIFIED] WebApp/src/partial.ts\npartial\nline2\nline3\nindex-edit\nworktree-edit\n\n\n// file: [MODIFIED] WebApp/src/unstaged-mod.ts\nunstaged-mod\nline2\nline3\nunstaged-edit\n\n\n// file: [NEW] WebApp/src/components/new/Widget.tsx\nexport const N = 1\n\n`,
      '第 1 步'
    )
    check(!r1.clip.includes('logo.png'), '第 1 步不應有 logo.png')
    checkRe(
      r1.note,
      /5 Git file\(s\) copied \(1 skipped: binary\)\. 442 chars · 32 lines · 47 words · ~57 tokens\./,
      '第 1 步通知'
    )
    return '442/32/47/57,逐字相同,未追蹤檔在最後,無 logo.png'
  }
})

defineCase('CC-05.1', {
  title: 'folder 全部複製;Other locations 設 Hide',
  pre: 'reset',
  mutates: true,
  run: async () => {
    await openMP()
    const r = await copyAndRead(async () => {
      await app.click(await find(/^按鈕 Copy all changes$/))
      await sleep(1300)
      return await ccNote()
    })
    checkRe(
      r.note,
      /13 Git file\(s\) copied \(1 skipped: binary\)\. 1,031 chars · 80 lines · 111 words · ~137 tokens\./,
      '第 1 步通知'
    )
    check(
      r.clip.split('\n')[1].startsWith('// file:'),
      `第 1 步第 2 行應以 // file: 開頭: ${JSON.stringify(r.clip.split('\n')[1])}`
    )
    await ccOtherLocations('Hide')
    return '13 檔 1,031 chars,第 2 行 // file:;Other locations 已設 Hide。接著 Bash 跑 pre/CC-05.2.sh'
  }
})

defineCase('CC-05.2', {
  title: '新建隱藏 worktree 後:提示與複製不含它',
  pre: 'script',
  mutates: true,
  run: async () => {
    await openMP()
    await ccRefresh()
    const hint = await grep(/Hidden worktrees under this folder are not included \(1\)/)
    check(hint, '第 2 步面板沒有 Hidden worktrees … not included (1)')
    check(!(await grep(/WebApp-cc05/)), '第 2 步清單不應有 WebApp-cc05')
    const r = await copyAndRead(async () => {
      await app.click(await find(/^按鈕 Copy all changes$/))
      await sleep(1300)
      return await ccNote()
    })
    checkRe(r.note, /not included/, '第 3 步先跳 info')
    checkRe(r.note, /13 Git file\(s\) copied \(1 skipped: binary\)\. 1,031 chars/, '第 3 步通知')
    check(!r.clip.includes('WebApp-cc05'), '剪貼簿不應含 WebApp-cc05')
    return '提示 (1) 出現,清單與剪貼簿都沒有 WebApp-cc05,13 檔 1,031 chars。接著 Bash 跑 pre/CC-05.cleanup.sh'
  }
})

defineCase('CC-05.cleanup', {
  title: '清理:移除隱藏 worktree,Other locations 改回 Show',
  pre: 'script',
  mutates: true,
  run: async () => {
    check(
      !/cc05/.test(sh('git -C $P/WebApp worktree list')),
      'WebApp 仍有 cc05 worktree(pre/CC-05.cleanup.sh 沒跑?)'
    )
    await openMP()
    await ccOtherLocations('Show')
    await ccRefresh()
    return 'worktree 已移除,Other locations 已改回 Show'
  }
})

defineCase('CC-06', {
  title: '一般 repo workspace 的複製;沒有 Paste & Restore',
  pre: 'reset',
  run: async () => {
    await openMP()
    await app.click(await ccWorktreeRow('WebApp', /^text (Active|Inactive) main primary main/))
    await sleep(2000)
    await ccEnsureSourceControl(/^按鈕 STAGED CHANGES/)
    check(
      !(await grep(/Paste & Restore|Copy all changes/)),
      '第 3 步:main workspace 不應有 Paste & Restore / Copy all changes'
    )
    const r1 = await copyAndRead(() => ccSecCopy(/^按鈕 STAGED CHANGES/, 1300))
    checkEq(
      r1.clip,
      '// clipcode-root: WebApp\n// file: [DELETED] src/deleted-staged.ts\ndeleted-staged\nline2\nline3\n\n\n// file: [MOVED] src/new-name.ts\nold-name\nline2\nline3\n\n\n// file: [MODIFIED] src/partial.ts\npartial\nline2\nline3\nindex-edit\n\n\n// file: [MODIFIED] src/staged-mod.ts\nstaged-mod\nline2\nline3\nstaged-edit\n\n',
      '第 1 步'
    )
    ccStat(r1.clip, '293 chars · 27 lines · 33 words · ~41 tokens.', '第 1 步')
    await app.click(await ccWorktreeRow('WebApp', /^text (Active|Inactive) feature\/x feature\/x/))
    await sleep(2000)
    await ccEnsureSourceControl(/^按鈕 CHANGES/)
    const r2 = await copyAndRead(async () => ccCtxCopy(await find(/^text unstaged-mod\.ts src/)))
    checkEq(
      r2.clip,
      '// clipcode-root: WebApp-feature\n\n// file: [MODIFIED] src/unstaged-mod.ts\nunstaged-mod\nline2\nline3\nfeature change\n\n\n',
      '第 2 步'
    )
    ccStat(r2.clip, '116 chars · 10 lines · 12 words · ~14 tokens.', '第 2 步')
    check(
      !(await grep(/Paste & Restore|Copy all changes/)),
      '第 3 步:feature workspace 不應有 Paste & Restore / Copy all changes'
    )
    await app.click(await find(/^彈出式按鈕 More source control actions/))
    await sleep(700)
    const menu = await grep(/Paste|Restore|Copy all/)
    await app.pressKey('Escape')
    await sleep(300)
    check(!menu, `第 3 步:More 選單不應有 Paste/Restore/Copy all: ${menu}`)
    return 'STAGED 293/27/33/41 與 feature 右鍵 116/10/12/14 逐字相同;工具列、右鍵與 More 選單都沒有 Paste & Restore / Copy all changes'
  }
})

defineCase('CC-07', {
  title: '沒有可複製內容',
  pre: 'script',
  mutates: true,
  run: async () => {
    await ensure5()
    check(
      clip().trim() === 'sentinel',
      `前置:剪貼簿不是 sentinel(pre/CC-07.sh 沒跑?): ${JSON.stringify(clip().slice(0, 40))}`
    )
    const r1 = await copyAndRead(() => ccRowCopy(/^按鈕 docs-site \(main\)/, 600))
    checkRe(r1.note, /No Git changes found to copy\./, '第 1 步通知')
    check(r1.clip === null, '第 1 步不應改剪貼簿')
    await app.click(await find(/^按鈕 WebApp \(main\)/))
    await sleep(1000)
    const r2 = await copyAndRead(async () => ccCtxCopy(await find(/^text logo\.png/)))
    checkRe(r2.note, /No Git changes found to copy\.|Nothing to copy/, '第 2 步通知')
    check(r2.clip === null, '第 2 步不應改剪貼簿')
    check(clip().trim() === 'sentinel', 'pbpaste 應仍是 sentinel')
    return `兩次都 ${r1.note.replace(/^\d+ 文字 /, '')} / ${r2.note.replace(/^\d+ 文字 /, '')},剪貼簿仍 sentinel`
  }
})

defineCase('CC-08', {
  title: '篩選中隱藏區段複製鈕',
  pre: 'reset',
  run: async () => {
    await openMP()
    await ccSelect(/^按鈕 WebApp \(main\)/, /^text partial\.ts src/)
    // 篩選會跨重置保留,先清掉殘留的
    const stale = (await lines()).find(([, t]) => t.startsWith('按鈕 Filter: '))
    if (stale) {
      await app.click(stale[0])
      await sleep(500)
    }
    if (await grep(/^按鈕 Clear and close filter/)) {
      await app.click(await find(/^按鈕 Clear and close filter/))
      await sleep(1000)
    }
    const before = (await findAll(/^按鈕 Copy Full Source$/)).length
    check(before > 0, '篩選前區段應有 Copy Full Source')
    await app.click(await find(/^按鈕 Filter files by name/))
    await sleep(700)
    await app.typeText('partial')
    await sleep(1200)
    const during = (await findAll(/^按鈕 Copy Full Source$/)).length
    // 輸入中是「文字欄位 … Description: Filter files…, Value: partial」,旁邊有 Clear and close filter
    await app.click(await find(/^按鈕 Clear and close filter/))
    await sleep(1200)
    const after = (await findAll(/^按鈕 Copy Full Source$/)).length
    check(during === 0, `篩選 partial 時仍有 ${during} 個 Copy Full Source`)
    check(after === before, `清空後 Copy Full Source 數量 ${after},篩選前 ${before}`)
    return `篩選前 ${before} 個 → 篩選中 0 → 清空後 ${after}`
  }
})

const ESC_EXPECT = `${ROOT}\n// file: [NEW] docs-site/escape-sample.txt\n//clipcode-esc: // file: fake.ts\n//clipcode-esc:   // file: src/indented.ts\n//clipcode-esc: # file: notes/x.py\n//clipcode-esc: /* file: y.c */\n//clipcode-esc: file: ./config.yml\n//clipcode-esc: FILE: Upper.TXT\n//clipcode-esc: //clipcode-esc: hi\nfile: undefined,\nconst file: string = "a.ts"\nfile: hello\n　// file: fullwidth.ts\n\n\n`

defineCase('CC-09', {
  title: 'escape 往返',
  pre: 'script',
  mutates: true,
  run: async () => {
    await ensure5()
    const r = await copyAndRead(() => ccRowCopy(/^按鈕 docs-site \(main\)/))
    checkEq(r.clip, ESC_EXPECT, '第 1 步')
    ccStat(r.clip, '402 chars · 17 lines · 45 words · ~48 tokens.', '第 1 步')
    const out = await rs({ overwrite: true })
    checkRe(out, /Overwrite\s*\(\s*1\s*\)/, '預覽應有 Overwrite (1)')
    checkRe(out, /docs-site\/escape-sample\.txt/, '預覽路徑')
    checkRe(out, /Created 0, overwritten 1, deleted 0, skipped 0\./, '還原通知')
    const cmp = sh(
      `printf '%s' "$(cat $ROOT/escape-sample.orig)" | cmp - $P/docs-site/escape-sample.txt && echo SAME`,
      { allowFail: true }
    )
    check(/SAME/.test(cmp), `還原後檔案與原檔不同: ${cmp.slice(0, 120)}`)
    return '複製 402/17/45/48 逐字相同;預覽 Overwrite (1);overwritten 1;還原後 cmp SAME'
  }
})

defineCase('CC-10', {
  title: '大小上限邊界、CJK 以位元組計',
  pre: 'script',
  mutates: true,
  run: async () => {
    await ensure5()
    const r = await copyAndRead(() => ccRowCopy(/^按鈕 docs-site \(main\)/, 2500), 8000)
    checkRe(
      r.note,
      /1 Git file\(s\) copied \(2 skipped: size exceeded\)\. 512,264 chars · 13 lines · 32 words · ~42 tokens\./,
      '通知'
    )
    checkEq(
      r.clip.slice(-191),
      'x\n\n\n// file: [NEW] docs-site/size-b-512001.txt\n// File skipped: size exceeds limit (512001 bytes)\n\n// file: [NEW] docs-site/size-c-cjk.txt\n// File skipped: size exceeds limit (512001 bytes)\n\n',
      '剪貼簿尾 191 字元'
    )
    return r.note.replace(/^\d+ 文字 /, '')
  }
})

defineCase('CC-11.1', {
  title: 'token 門檻:100 萬黃色警告',
  pre: 'script',
  mutates: true,
  run: async () => {
    await ensure5()
    const r = await copyAndRead(() => ccRowCopy(/^按鈕 docs-site \(main\)/, 2500), 10000)
    checkRe(
      r.note,
      /2 Git file\(s\) copied\. 1,024,100 chars · 11 lines · 13 words · ~1,024,015 tokens\./,
      '通知數字'
    )
    checkRe(r.note, /Over 1,000,000 tokens/, '通知門檻字樣')
    await sleep(3000)
    checkRe(await ccNote(), /Over 1,000,000 tokens/, '3 秒後通知應仍在(不自動消失)')
    return '1,024,100/11/13/1,024,015 Over 1,000,000,3 秒後仍在;黃色外觀需人工確認(上輪判定文件描述與 UI 不符)'
  }
})

defineCase('CC-11.2', {
  title: 'token 門檻:200 萬紅色錯誤',
  pre: 'script',
  mutates: true,
  run: async () => {
    await ccRefresh()
    const r = await copyAndRead(() => ccRowCopy(/^按鈕 docs-site \(main\)/, 3000), 12000)
    checkRe(
      r.note,
      /4 Git file\(s\) copied\. 2,048,168 chars · 19 lines · 23 words · ~2,048,027 tokens\./,
      '通知數字'
    )
    checkRe(r.note, /Over 2,000,000 tokens/, '通知門檻字樣')
    await sleep(3000)
    checkRe(await ccNote(), /Over 2,000,000 tokens/, '3 秒後通知應仍在(不自動消失)')
    return '2,048,168/19/23/2,048,027 Over 2,000,000,3 秒後仍在;紅色外觀需人工確認'
  }
})

defineCase('CC-11.cleanup', {
  title: '清掉大剪貼簿',
  pre: 'script',
  mutates: true,
  run: async () => {
    await dismissToasts()
    check(
      clip().trim() === 'x',
      `大剪貼簿未清掉(pre/CC-11.cleanup.sh 沒跑?): ${clip().length} 字元`
    )
    return '剪貼簿已清為 x'
  }
})

defineCase('CC-12.1', {
  title: '靜默略過與無法讀取:第 1 步',
  pre: 'script',
  mutates: true,
  run: async () => {
    await ensure5()
    const r = await copyAndRead(() => ccRowCopy(/^按鈕 docs-site \(main\)/, 3500), 8000)
    checkRe(r.note, /2 Git file\(s\) copied/, '通知應複製 ok.txt 與 icon.svg')
    checkRe(r.note, /\(1 unreadable\)/, '通知應計 1 個 unreadable(big50)')
    check(r.clip.includes('// file: [NEW] docs-site/ok.txt\nok\n'), '應含 ok.txt')
    check(
      r.clip.includes('// file: [NEW] docs-site/icon.svg\n'),
      '應含 icon.svg(修正後 SVG 視為文字)'
    )
    check(!/nul-late|big50/.test(r.clip), 'nul-late.txt / big50.txt 不應在剪貼簿')
    return r.note.replace(/^\d+ 文字 /, '')
  }
})

defineCase('CC-12.2', {
  title: '靜默略過與無法讀取:第 2 步(刪 ok、big50)',
  pre: 'script',
  mutates: true,
  run: async () => {
    await ccRefresh(3500)
    const r = await copyAndRead(() => ccRowCopy(/^按鈕 docs-site \(main\)/, 2500), 8000)
    checkRe(r.note, /1 Git file\(s\) copied/, '通知應只複製 icon.svg')
    check(
      r.clip.includes('docs-site/icon.svg') && !/ok\.txt|nul-late|big50/.test(r.clip),
      '只應含 icon.svg'
    )
    return r.note.replace(/^\d+ 文字 /, '')
  }
})

defineCase('CC-12.3', {
  title: '靜默略過與無法讀取:第 3 步(staged SVG 兩入口)',
  pre: 'script',
  mutates: true,
  run: async () => {
    await ccRefresh(3500)
    await app.click(await find(/^按鈕 docs-site \(main\)/))
    await sleep(1500)
    const r1 = await copyAndRead(() => ccSecCopy(/^按鈕 STAGED CHANGES \d/, 1500))
    checkEq(
      r1.clip,
      `${ROOT}// file: [NEW] docs-site/icon.svg\n<svg xmlns="http://www.w3.org/2000/svg"/>\n\n`,
      'STAGED 區段'
    )
    const r2 = await copyAndRead(() => ccRowCopy(/^按鈕 docs-site \(main\)/, 2000))
    check(
      r2.clip !== null && r2.clip.includes('docs-site/icon.svg'),
      `repo 列也應複製 icon.svg(兩入口一致): ${r2.note}`
    )
    return `STAGED 區段逐字相同;repo 列 ${r2.note.replace(/^\d+ 文字 /, '')}`
  }
})

const ccDocsSiteCopy = async (id, expectBody, stats) => {
  const r = await copyAndRead(() => ccRowCopy(/^按鈕 docs-site \(main\)/))
  checkEq(r.clip, `${ROOT}\n// file: [NEW] docs-site/${expectBody}`, `步驟 ${id}`)
  ccStat(r.clip, stats, `步驟 ${id}`)
  return stats
}

defineCase('CC-13.1', {
  title: 'Unicode 檔名與內容',
  pre: 'script',
  mutates: true,
  run: async () => {
    await ensure5()
    return await ccDocsSiteCopy(
      1,
      '中文 檔名.md\n你好，世界 👍\ncafé\n\n\n',
      '82 chars · 8 lines · 11 words · ~13 tokens.'
    )
  }
})
defineCase('CC-13.2', {
  title: 'CRLF',
  pre: 'script',
  mutates: true,
  run: async () => {
    await ccRefresh()
    return await ccDocsSiteCopy(
      2,
      'crlf.txt\na\r\nb\r\n\n\n',
      '74 chars · 8 lines · 9 words · ~11 tokens.'
    )
  }
})
defineCase('CC-13.3', {
  title: '空檔',
  pre: 'script',
  mutates: true,
  run: async () => {
    await ccRefresh()
    return await ccDocsSiteCopy(3, 'empty.txt\n\n\n', '69 chars · 6 lines · 7 words · ~9 tokens.')
  }
})
defineCase('CC-13.4', {
  title: '$& 檔名',
  pre: 'script',
  mutates: true,
  run: async () => {
    await ccRefresh()
    return await ccDocsSiteCopy(
      4,
      'weird$&$$name.ts\nx\n\n\n',
      '78 chars · 7 lines · 8 words · ~10 tokens.'
    )
  }
})

defineCase('CC-14', {
  title: '非 UTF-8 檔案',
  pre: 'script',
  mutates: true,
  run: async () => {
    await ensure5()
    // 9cd98c293 後與外掛一致:非 UTF-8 略過並計數,不再輸出 U+FFFD(cross-check.md IJ-09)
    const r = await copyAndRead(() => ccRowCopy(/^按鈕 docs-site \(main\)/))
    checkRe(r.note, /1 Git file\(s\) could not be read\./, '通知')
    check(r.clip === null, `剪貼簿不應改變: ${String(r.clip).slice(0, 80)}`)
    return `${r.note.replace(/^\d+ 文字 /, '')},剪貼簿未改`
  }
})

defineCase('CC-15', {
  title: '先 stage 再刪除(MD / AD)',
  pre: 'script',
  mutates: true,
  run: async () => {
    await ensure5()
    await app.click(await find(/^按鈕 WebApp \(main\)/))
    await sleep(1200)
    const r1 = await copyAndRead(async () =>
      ccCtxCopy(await rowInSection(/^按鈕 CHANGES \d/, /^text staged-mod\.ts src/))
    )
    checkEq(
      r1.clip,
      `${ROOT}// file: [DELETED] WebApp/src/staged-mod.ts\nstaged-mod\nline2\nline3\n\n`,
      'MD'
    )
    ccStat(r1.clip, '99 chars · 7 lines · 10 words · ~12 tokens.', 'MD')
    const r2 = await copyAndRead(async () =>
      ccCtxCopy(await rowInSection(/^按鈕 CHANGES \d/, /^text added-then-removed\.ts src/))
    )
    checkEq(
      r2.clip,
      `${ROOT}// file: [DELETED] WebApp/src/added-then-removed.ts\n// This file has been deleted in this change\n`,
      'AD'
    )
    ccStat(r2.clip, '128 chars · 4 lines · 16 words · ~18 tokens.', 'AD')
    return 'MD 取 HEAD 內容 99/7/10/12;AD 刪除佔位 128/4/16/18,逐字相同'
  }
})

defineCase('CC-16', {
  title: '改名後又修改(RM)',
  pre: 'script',
  mutates: true,
  run: async () => {
    await ensure5()
    const r = await copyAndRead(() => ccRowCopy(/^按鈕 WebApp \(main\)/))
    const n = r.clip.split('\n').filter((l) => l.includes('new-name'))
    check(
      n.length === 1 && n[0] === '// file: [MODIFIED] WebApp/src/new-name.ts',
      `new-name 的標頭: ${JSON.stringify(n)}`
    )
    check(
      r.clip.includes(
        '[MODIFIED] WebApp/src/new-name.ts\nold-name\nline2\nline3\nrenamed-then-edited\n'
      ),
      '內容應為 old-name…renamed-then-edited'
    )
    check(!r.clip.includes('[MOVED]'), '不應有 [MOVED]')
    return '只有一段 [MODIFIED] new-name.ts,含 renamed-then-edited,無 [MOVED]'
  }
})

defineCase('CC-17', {
  title: '超過 12 萬行的 staged 檔取 index 版本',
  pre: 'script',
  mutates: true,
  run: async () => {
    await ensure5()
    await app.click(await find(/^按鈕 docs-site \(main\)/))
    await sleep(2000)
    const r = await copyAndRead(() => ccSecCopy(/^按鈕 STAGED CHANGES \d/, 3000), 10000)
    check(r.clip !== null, `沒有複製到剪貼簿: ${r.note}`)
    check(!r.clip.includes('worktree-tail'), '拿到工作區版本(含 worktree-tail)')
    const iLines = r.clip.split('\n').filter((l) => l === 'i').length
    check(
      iLines === 130000,
      `index 版本應有 130000 行 i,實際 ${iLines};剪貼簿開頭 ${JSON.stringify(r.clip.slice(0, 120))}`
    )
    return `index 版本 130000 行 i,無 worktree-tail;${r.note.replace(/^\d+ 文字 /, '')}`
  }
})
