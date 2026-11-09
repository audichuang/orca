# 獨立 rebase 審查證據

Head: `919eb16330dff80917ec0cee34a2e0373a2a0381`；base: `v1.4.254`。

- 原始 seam 清單：96 檔、500 測試通過（seams.log）。
- `pnpm tc`：退出碼 0（typecheck.log）。
- fork-upstream-api、fork-upstream-script-refs、fork-test-inventory、fork-mac-helpers、fork-pr-gate-needs、fork-locale-parity：通過。
- 跨版本與發版檢查：8 檔，71 passed / 1 failed。現有 `fork-layout-owner-dark-tripwire.unit.test.ts:111` 預期拒絕 git-graph，但 v1.4.254 接受。
- 原始 folder e2e：等待 Refresh all repositories 30 秒逾時（folder-e2e.log）。
- 暫時指定英文並加探針：Refresh all 可見，Copy all changes 找不到（folder-copy-all.log、folder-copy-all-missing.png）。
- 實際 hydration 的 folder edit，Changes 送出 id:folder:folder / repo-a/src/a.ts，而不是 repo owner / src/a.ts（restore-and-sidebar.log）。
- 舊 localStorage 隱藏選擇被忽略：預期 bfs-main，收到 etf-main,bfs-main（restore-and-sidebar.log）。
- 暫時補回 repo 路由與舊隱藏篩選，兩個對應探針通過；其他非目標測試以 -t 排除（restored-controls.log / diff）。所有 production 變動均已還原。
- 上游 attached repo 在 folder 實體路徑外：panel owners 包含 outside，但 openGitGraphTab 在無內部 repo 時不開，在有內部 repo 時開成 inside（attached-graph.log）。

## Mutation

- history IPC 拿掉 graph：1 項 assertion 失敗。
- diff IPC 拿掉 skipRenderLimit：1 failed / 1 passed。
- folder panel 拿掉 folder-path owners：1 項 assertion 失敗。
- Commits dock 拿掉 slots：5 failed / 1 passed。
- EditorContent 切回 upstream surface：失敗原因是 TooltipProvider 缺失，不能當成行為斷言的有效證明。
- session writer 拿掉 gitWorktreeId：完整 seam 96 檔、500 測試仍通過（mutation-session-save-owner.log）。

每項 mutation 的完整輸出和實際 diff 都在同名 log / diff。小組 session mutation 是 6 檔、9 測試通過（subset.log）。

## 重現

從此 worktree 根目錄：

```sh
node config/scripts/native-build/node-addons/ensure-native-runtime.mjs --runtime=node
python3 out/fork-rebase-review-codex/reproduce.py
```

程式暫時放入 3 個探針檔，實際執行 vitest 後刪除；此 head 預期 4 failed / 1 passed。探針原始碼以 .txt 保存。

現有跨版本錯誤可直接跑：

```sh
LC_ALL=C ORCA_BACKGROUND_LAUNCH=1 pnpm exec vitest run --config config/vitest.config.ts tests/e2e/cross-version-wire/fork-layout-owner-dark-tripwire.unit.test.ts
```

現有 folder e2e 可直接跑：

```sh
LC_ALL=C ORCA_BACKGROUND_LAUNCH=1 SKIP_BUILD=1 ORCA_MR_ONLY='^S1 ' pnpm run test:e2e tests/e2e/folder-multi-repo-source-control.spec.ts --workers=1 --reporter=line
```

此 worktree 已有本次 head 的 E2E build，來源未再改動。未跑完整 fork-check-full、真實 SSH 主機或簽章發版。
