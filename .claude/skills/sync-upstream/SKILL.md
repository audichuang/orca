---
name: sync-upstream
description: Use when syncing upstream (stablyai/orca) updates into this fork's develop — fetch origin/main, triage which commits to cherry-pick vs skip by this fork's architecture-divergence rules, verify per-commit, and record every skip to the durable skip log. Triggers on 追上游、合 upstream、sync upstream、上游更新了幫我擇優合、把上游改動 cherry-pick 進來、選擇性合併上游.
---

# 擇優合併上游 (selective upstream sync)

把上游 `origin` (stablyai/orca) 的更新**擇優**合進本 fork 的 `develop`——不是全合。本 fork 在某些區已**超越上游**（例如多 server 事件風暴優化），凡上游還在修補本 fork 已淘汰架構的 commit 一律**跳過**並記錄。先讀 `CLAUDE.local.md` 的 fork / 分支 / push 脈絡。

**跳過判準 (single source of truth)**：`docs/reference/upstream-sync-skipped.md` 的「架構分歧說明」。每次同步**先讀它**——它列出本 fork 已取代上游的機制與「未來怎麼追」判準，並在 Step 5 往上累積。凡上游 commit 觸及那些機制 → 預設跳過。

## Step 1 — 算落差、取實質 commit 時間序清單
```bash
git fetch origin main
git rev-list --left-right --count develop...origin/main                       # 落差 (左=develop獨有 右=上游獨有)
MB=$(git merge-base develop origin/main)
git log --reverse --no-merges --format='%h %s' "$MB"..origin/main             # 上游獨有,舊→新
```
排除 release tag commit 與空 commit（`git diff <h>^ <h> --stat` 無輸出者）。
**完成準則**：得到一份實質 commit 的時間序清單，每顆標好處置欄待填。

## Step 2 — 逐 commit 分類:合 / 小心 / 跳過
先比對跳過判準（決策日誌）。對每顆評估：價值、是否碰本 fork 改過的檔、與 fork 優化是否**語意**衝突（檔名相同 ≠ 衝突，要看 hunk）。
- commit 多（>15）時用 **workflow 並行**：每顆一個 agent 跑 `git show <h>` 並對照 `git diff "$MB" develop -- <file>`，輸出結構化「合/小心/跳過 + 理由 + 衝突分析」。
- 三層：**合**（零重疊或 additive）、**小心**（碰重疊熱區，cherry-pick 要手動解）、**跳過**（碰 fork 已取代的架構，或與 fork 場景無關如純 Windows/WSL/mobile/未用整合）。
**完成準則**：每顆恰好落入一層，跳過的都有可寫進日誌的理由。

## Step 3 — 從 develop 開 worktree、按時間序 cherry-pick
```bash
git worktree add .claude/worktrees/sync-<tag> -b sync/<tag> develop
```
進 worktree，**嚴格按上游時間序（舊→新）** `git cherry-pick -x <h>`，跳過判準內的不 pick。
**時間序是紀律**：同檔被多顆連續修改時，亂序會讓 patch context 對不上而誤報衝突。
解衝突時：本 fork 優化區一律保留 fork 版；上游若帶回 fork 已刪的符號（如舊 queue import）**丟棄之**，絕不把淘汰架構帶回。
**完成準則**：所有「合 / 小心」顆都 commit、無 conflict marker 殘留、無已刪架構符號被帶回（`git grep <舊符號>` 為空）。

## Step 4 — 重要顆驗證、大功能 codex 複查
- **重要顆**（碰重疊熱區）每顆合完即驗：`pnpm typecheck` + 對應 focused `vitest`（見 Reference）。
- **大功能**（大 commit / 100 檔級）合完呼叫 **codex 複查**合併語意：`git merge-tree <h>^ develop <h>` 預檢 conflict marker、`git range-diff` 確認無語意 interdiff、確認 fork 改動無損。
- **簡單顆**（零重疊）整批 cherry-pick、批末一次 typecheck 即可。
**完成準則**：typecheck 3 tsgo 全過、focused 測試全綠、大功能 codex 判 CONFIRMED。

## Step 5 — 記錄跳過決策 (必做,這個 skill 的長期價值)
在 `docs/reference/upstream-sync-skipped.md` 新增本次同步區塊：跳過的 commit、為什麼跳、未來怎麼追。
若這次浮現**新的**架構分歧線，補進「架構分歧說明」當未來判準——下次同步就不必重新研究。

## Step 6 — 合回 develop + push fork
```bash
OLD=$(git rev-parse --short develop)
git -C <main-repo> branch develop-pre-<tag>-sync "$OLD"     # 回退錨點 (測壞了好退)
git -C <main-repo> merge --ff-only sync/<tag>               # develop 沒前進則可 ff
git -C <main-repo> push fork develop                        # push fork,不是上游 origin
```

## Reference — 重疊熱區與驗證
- **重疊熱區**（本 fork 改過、最易撞的檔，碰到 = 小心顆）：`hooks/useIpcEvents.ts`、`store/slices/worktrees.ts`、`shared/types.ts`、`preload/index.ts`+`api-types.ts`、`web/web-preload-api.ts`、`sidebar/WorktreeList.tsx`、`i18n/locales/*.json`。i18n 衝突解法統一「兩邊 key 都保留」、確認 fork 自家字串沒被蓋。
- **focused 驗證**（別跑整套 `pnpm test`，有與本次無關的既有 failures）：
  `pnpm exec vitest run --config config/vitest.config.ts <改到的 test 檔>`
- **環境**：`make update` build；agent 環境無 corepack，用 Homebrew pnpm/node（見 memory `pnpm-toolchain-bash-env`）。
