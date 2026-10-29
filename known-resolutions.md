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

## fork 自身問題（待人判斷，auto-rebase 不要照做：folder 層級的外部變更要不要配對到 repo-scoped diff 分頁：兩條路徑不一致）× fork 1f0c6b9b5a（folder workspace 多 repo）、8da7b7c407（folder diff 改用 filePath 比對）— auto-rebase 2026-10-27
- 類型：待人判斷
- 衝突檔：無
- 連帶症狀：無（審查者 C 的 mutation：拿掉 `editor-autosave.ts:177` 的 `getOpenFileGitWorktreeId(file) === target.worktreeId`，所有測試仍綠）
- 處理：`getOpenFilesForExternalFileChange` 的 fallback 路徑（沒有 `indexedOpenFiles` 時）用第 177 行排除「target 是 folder 本身、分頁是 repo-scoped diff」的情境；`editor-external-watch-path-index.ts` 的 index 路徑在同一情境以 `filePath` 配對、會包含它。第 177 行原本是為了 relativePath 撞名（8da7b7c407 之前用 relativePath 比對），現在 scoped 分頁已改用 filePath 比對，這個目的已由第 174 行達成。要使用者決定：刪掉第 177 行（跟 index 路徑一致），或讓 index 路徑也排除；決定後在 `editor-autosave.fork.test.ts` 補一個會咬的測試。不要在 auto-rebase 裡自己選一邊。
- 守它的測試：待補（editor-autosave.fork.test.ts）
- 驗證：未驗證（只有讀程式碼與 C 的 mutation 結果）

## fork 自身問題（上游新的 WSL 搬移匯出不改寫 fork 的 `gitWorktreeId`）× fork 1f0c6b9b5a（folder workspace 多 repo）— auto-rebase 2026-10-29
- 類型：fork 自身問題
- 衝突檔：無
- 連帶症狀：無（測試全綠）。v1.4.244 rebase 的審查者 B 與 Codex 找到：上游 v1.4.244 大幅擴充 `src/main/persistence/moving-wsl-projects/*`，匯出（`wsl-move-manifest-export.ts:166`）依 `src/main/ssh/orcad-migration-path-fields.ts:62` 的欄位表改寫 open file 的 `filePath`、`worktreeId`，表裡沒有 fork 的 `gitWorktreeId`（`workspace-session-editor-schema.ts:12`）。Codex 暫加案例實測：匯出後 `gitWorktreeId` 還是 Windows UNC 形式的舊 id（應為 `app::/home/me/app`），交給 `hydrateEditorSession` 後 editor 失去 `gitWorktreeId`。
- 處理：在 `orcad-migration-path-fields.ts` 的欄位表加 `gitWorktreeId`（照 `openFilesByWorktree{}[].worktreeId` 那筆的寫法），補 fork 測試（sibling `.fork.test.ts`）：exporter 會改寫 `gitWorktreeId`、hydration 後保留。新搬移在 `ORCA_INTERNAL_WSL_HOSTS=1` 後面、預設關閉，所以這次不擋 rebase；auto-rebase 照這條做算 MANUAL，要 mutation 證明（拿掉欄位表那筆要紅）。上游之後改這張表的結構就以眼前為準。
- 守它的測試：待補（上面的 fork 測試）
- 驗證：未驗證（只有 Codex 暫加案例的結果）

## fork 自身問題（`config/fork-seam-tests.txt` 漏列兩個守 seam 的測試）× fork 7b55a30d74（補上游接縫的非 UI 契約測試）、8af97f9687（ClipCode 搬進 fork slots）— auto-rebase 2026-10-29
- 類型：fork 自身問題
- 衝突檔：無
- 連帶症狀：無。v1.4.244 rebase 審查者 C2 的 mutation：`file-diff.ts` catch 區把兩邊標成 missing，只有 `src/main/git/source-control/file-diff.read-failure.test.ts` 會紅；`branch-entry-row.tsx` 的 `viewItems` slot 只有 `src/renderer/src/components/right-sidebar/source-control/listing/source-control-entry-context-menu.fork.test.tsx` 會紅。兩個都不在 seam 清單，`make fork-check-seams` 跑不到（CI 的完整單元測試會跑）。
- 處理：`file-diff.read-failure.test.ts` 加進 `blob-absence-real-git.fork.test.ts` 那組，`source-control-entry-context-menu.fork.test.tsx` 加進「Upstream component slots and folder routing」組。只改 `config/fork-seam-tests.txt`；`fork-check-lint` 會檢查路徑存在、不重複。
- 守它的測試：`make fork-check-seams`、`fork-check-lint` 的 seam 清單檢查
- 驗證：未驗證
