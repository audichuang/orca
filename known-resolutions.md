# 已知的上游衝突與處理方式

待處理的建議，一個根因一條：每日 canary（`make fork-canary`）對上游 main 試合時看過的衝突，以及 fork 自身問題。auto-rebase 用 `git merge-base --is-ancestor <上游 commit> vNEW` 判斷條目適用（fork 自身問題沒有上游 commit，修正還沒做就適用），照它處理；develop 移動後把用過的條目搬進 `resolution-history.md`。之前怎麼處理過，看 `resolution-history.md`。只經 `config/scripts/fork-notes.sh` 寫。

範本（複製後填寫，不要留這段以外的範例）：

```
## <上游 commit 完整 sha（fork 自身問題寫「fork 自身問題」）>（#PR 號、標題）× fork <短 sha>（標題）— canary <YYYY-MM-DD>
- 類型：上游修了同一件事｜兩邊各改各的｜上游改了 fork 依賴的 API｜fork 自身問題｜待人判斷
- 衝突檔：<路徑>…
- 連帶症狀：typecheck 錯誤 <檔>…；失敗測試 <檔>…
- 處理：<丟掉 fork commit X 並刪哪些測試｜採上游結構後把 fork 的哪幾行加回｜fork 這邊怎麼跟上>
- 守它的測試：<config/fork-seam-tests.txt 的組名或測試檔>
- 驗證（<YYYY-MM-DD>，上游 <sha>）：<跑了什麼、結果>｜未驗證
```

## b7fb07c379383d2bc6b17ca08f742ce855bd605a（#34072、fix(ci): unblock main: split over-long files and pin scanner test file times）× 無 fork commit — canary 2026-10-27
- 類型：上游自己就紅（fork 沒碰 `src/renderer/src/components/native-chat/`）
- 衝突檔：無
- 連帶症狀：typecheck 錯誤 src/renderer/src/components/native-chat/use-native-chat-context-menu.tsx（TS6133 `'StructuredChatPaneMenuItems' is declared but its value is never read`，第 33 行）；上游 lint 的 `oxlint` 步驟紅（同一行，`eslint(no-unused-vars)`）。
- 處理：#34072 把 JSX 換成 `NativeChatStructuredPaneMenuItems`，留下舊的 import。canary 時上游 main（到 2e67ba5a64）還沒修。auto-rebase 時：vNEW 不含 b7fb07c379 → 不適用；含而且乾淨的 vNEW worktree 一樣紅 → 在上游 main 找刪掉這行 import 的 commit cherry-pick（`git log vNEW..origin/main -- src/renderer/src/components/native-chat/use-native-chat-context-menu.tsx`）；還沒有就加一個只刪這行 import 的 fork commit，下一次 rebase 到含上游修正的 release 時丟掉它（同 23bc22afdf 的前例）。
- 守它的測試：`pnpm tc`、上游 lint 的 `oxlint`
- 驗證（2026-10-27，上游 b7fb07c379383d2bc6b17ca08f742ce855bd605a）：套上其他條目後 `pnpm tc` 只剩這一個錯；`git show origin/main:<檔>` 裡 `StructuredChatPaneMenuItems` 只出現在 import 那一行。

## f34c13ca1ece8369f0d2bcfa8d4547526a247100（#33889、test: remove low-value main-process suites and browser probes）、ad2156c358487d9ddebf1f5b6faad0aa0c90e359（#34062、test: remove 140 low-value cases and 49 suites）× fork a6a4352e8a、dfb4a446e8（這兩個 commit 自己的 cherry-pick）— auto-rebase 2026-10-27
- 類型：上游修了同一件事
- 衝突檔：可能有 .github/workflows/pr.yml（只對 #33889 那個）
- 連帶症狀：無
- 處理：v1.4.242 過不了 `check:test-file-runners`（`ci-unit-files.mjs` 列了 browser-route-{tcp-egress,h3-egress,dns-prefetch}.electron.test.ts，pr.yml 卻已經不跑），auto-rebase v1.4.242 用 `cherry-pick -x` 把這兩個上游 main commit 帶進 develop（標題與上游相同，訊息有 `(cherry picked from commit …)`）。#33889 那個在 pr.yml 衝突時採了 v1.4.242 那側（v1.4.242 的 pr.yml 已經沒有那三行），所以它的 patch 比上游少一個 pr.yml hunk，patch-id 對不上，rebase 到含 f34c13ca1e 的 release 時**不會**自動略過：可能空掉（`--empty=drop` 會丟）或在 pr.yml／被刪的檔衝突。適用條件 `git merge-base --is-ancestor f34c13ca1ece8369f0d2bcfa8d4547526a247100 vNEW`：成立就照第 1 步「丟 commit」的做法用標題 `test: remove low-value main-process suites and browser probes (#33889)` 在 `vOLD..OLD_DEVELOP` 找到它丟掉。ad2156c358 那個 patch 跟上游相同，應該自動略過；沒略過（標題 `test: remove 140 low-value cases and 49 suites (#34062)` 還出現在 range-diff 的 `=`／`!`）也一樣丟掉。
- 守它的測試：`check:test-file-runners`（上游 lint 步驟）
- 驗證（2026-10-27，上游 v1.4.242）：兩個 cherry-pick 後 `check:test-file-runners` 從紅轉綠；revert 任一個就紅。

## fork 自身問題（待人判斷，auto-rebase 不要照做：folder 層級的外部變更要不要配對到 repo-scoped diff 分頁：兩條路徑不一致）× fork 3c377c2b27（folder workspace 多 repo）、ba35906362（folder diff 改用 filePath 比對）— auto-rebase 2026-10-27
- 類型：待人判斷
- 衝突檔：無
- 連帶症狀：無（審查者 C 的 mutation：拿掉 `editor-autosave.ts:177` 的 `getOpenFileGitWorktreeId(file) === target.worktreeId`，所有測試仍綠）
- 處理：`getOpenFilesForExternalFileChange` 的 fallback 路徑（沒有 `indexedOpenFiles` 時）用第 177 行排除「target 是 folder 本身、分頁是 repo-scoped diff」的情境；`editor-external-watch-path-index.ts` 的 index 路徑在同一情境以 `filePath` 配對、會包含它。第 177 行原本是為了 relativePath 撞名（ba35906362 之前用 relativePath 比對），現在 scoped 分頁已改用 filePath 比對，這個目的已由第 174 行達成。要使用者決定：刪掉第 177 行（跟 index 路徑一致），或讓 index 路徑也排除；決定後在 `editor-autosave.fork.test.ts` 補一個會咬的測試。不要在 auto-rebase 裡自己選一邊。
- 守它的測試：待補（editor-autosave.fork.test.ts）
- 驗證：未驗證（只有讀程式碼與 C 的 mutation 結果）
