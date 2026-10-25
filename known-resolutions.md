# 已知的上游衝突與處理方式

每日 canary（`make fork-canary`）對上游 main 試合時看過的衝突，一個根因一條。auto-rebase 用 `git merge-base --is-ancestor <上游 commit> vNEW` 判斷條目適用，照它處理；develop 移動後刪掉用過的條目。只經 `config/scripts/fork-notes.sh` 寫。

範本（複製後填寫，不要留這段以外的範例）：

```
## <上游 commit 完整 sha>（#PR 號、標題）× fork <短 sha>（標題）— canary <YYYY-MM-DD>
- 類型：上游修了同一件事｜兩邊各改各的｜上游改了 fork 依賴的 API｜待人判斷
- 衝突檔：<路徑>…
- 連帶症狀：typecheck 錯誤 <檔>…；失敗測試 <檔>…
- 處理：<丟掉 fork commit X 並刪哪些測試｜採上游結構後把 fork 的哪幾行加回｜fork 這邊怎麼跟上>
- 守它的測試：<config/fork-seam-tests.txt 的組名或測試檔>
- 驗證（<YYYY-MM-DD>，上游 <sha>）：<跑了什麼、結果>｜未驗證
```

## 0b28553093b872fb0013795ad334d6001da34967（#33450、feat(ssh): show saved port forwards that couldn't start…）× fork fa84af8c04、519950c24b 等 Git Graph 系列（Commits 區分支篩選、Git Graph 全螢幕分支樹）— canary 2026-10-25
- 類型：兩邊各改各的
- 衝突檔：src/renderer/src/i18n/locales/{en,es,fr,ja,ko,pt,zh}.json（每檔一個 hunk）
- 連帶症狀：無（typecheck 與 170 個 fork 測試檔在上游側的 locale 下也全過，所以只有衝突，沒有其他症狀）
- 處理：上游在 `auto.components.right.sidebar` 尾端新增 `ssh.unrestored.port.row`（3 個 key），fork 在同一處新增 Git Graph 的字串（`GitHistoryGraph` 等）。兩邊都只新增 key，沒有重疊、也沒有刪除。照 FORK.md 兩邊都留，但**不要直接手改衝突標記**：上游那段結尾停在還沒關的 `ssh` 物件裡，兩段直接接起來會變成不合法的 JSON。改用 JSON deep merge：以上游（ours）檔為底，依序補上 fork（theirs）有、上游沒有的 key，用 `json.dumps(…, ensure_ascii=False, indent=2) + "\n"` 輸出（上游檔用這個格式重新輸出，與原檔逐位元組相同）。key 有重疊時值必須相同，不同就停下來。
- 守它的測試：`pnpm run verify:localization-catalogs`、`node config/scripts/fork-locale-parity.mjs <基底>`（`make fork-check-lint`）。注意：canary 對上游 main 試合時，FORK_BASE 還是舊 tag，上游 main 新加、只放進 en.json 的 key（像 #33260 的 `auto.store.slices.worktrees.localBaseRef*`，14 個）會被誤算成 fork key，報 6 個 locale 各缺 14 個；改用上游 main 當基底就通過。auto-rebase 時基底是 vNEW，不會有這個誤報。
- 驗證（2026-10-25，上游 aa08c84f3b8cb6bbdd62db1d803ba8b3e7973fda）：在 canary worktree 依上述 deep merge 合好 7 檔 → `verify:localization-catalogs` 通過（17550 個 key 參照）；`fork-locale-parity.mjs HEAD`（上游 main 當基底）通過，fork 的 174 個 key 7 個 locale 都有；`pnpm tc` 通過；canary 那 170 個測試檔 963 個測試全過。

## 7d6603aa1766eb4cac079f8d6d2f4e67f251574a（#33249、[comment audit] Complete repository-wide comment cleanup）× fork 多個 commit（ec28156735 folder workspace 多 repo 變更面板、ClipCode 複製與還原,移植到 v1.4.229；86336a5e53 feat(diff): step into the next file at the last change, IntelliJ-style；3e56c694ff Git Graph 改成編輯器分頁…；78293141ea fix(source-control): keep toasts above the bulk action bar；fb0b3d9c4b folder 裡的 repo 可以只在 folder 顯示…；b5a3905d53 refactor(source-control): move the fork's commit menu entries into a slot 等，報告逐檔列出）— canary 2026-10-26
- 類型：兩邊各改各的（上游只改寫或刪掉註解，fork 改程式碼）
- 衝突檔（19）：src/main/project-groups/nested-repo-discovery.ts、src/renderer/src/assets/main.css、src/renderer/src/components/editor/{EditorPanel.tsx,diff-navigation-context.tsx,restored-editor-same-workspace-reown.test.tsx}、src/renderer/src/components/right-sidebar/source-control/commit/{source-control-entry-failure-toast.ts,use-discard-confirmation.ts,use-entry-mutations.ts}、…/source-control/panel/{panel-content.tsx,panel.tsx,use-worktree-operation-state.ts}、…/source-control/sync/{git-history-commit-files.tsx,use-git-history-commit-actions.ts}、src/renderer/src/components/tab-bar/EditorFileTab.tsx、src/renderer/src/components/ui/sonner.tsx、src/renderer/src/lib/{remap-open-editor-tabs-for-path-change.ts,workspace-session-hydration-keys.ts}、src/renderer/src/store/slices/editor/actions/open-conflict-review.ts、src/renderer/src/store/slices/editor/types/open-file.ts（共 26 個 hunk）
- 連帶症狀：canary 把衝突檔重設成上游版後，`open-file.ts` 少了 `gitWorktreeId`／`gitGraph`、`diff-navigation-context.tsx` 少了 `filePosition`，造成約 90 個 typecheck 錯誤檔（ChangesModeView、EditorConflictReviewSurface、git-graph-tab/*、store/slices/editor/** 等）與 29 個失敗測試檔（fork-editor-kind-sites.guard、nested-repo-discovery.fork、remap-open-editor-tabs-for-path-change.fork、workspace-session-hydration-keys.fork、diff-file-boundary-navigation、panel-content-fork-slots、sonner.fork、git-graph-full-view.component 等）。照下面合好後全部消失。
- 處理：每個 hunk 都是「fork 的程式碼＋上游改寫後的註解文字」；base→上游只動註解（workspace-session-hydration-keys.ts 的 import 路徑改動在沒衝突的區域，自動合入）。上游整段刪掉的註解不加回（main.css 的 `/* ── Sidebar ── */` 標題、git-history-commit-files.tsx 的「Author and date…」、panel.tsx 的元件 doc comment）；fork 自己寫的註解照留。特例：
  - use-git-history-commit-actions.ts 第 2 個 hunk 採 fork（刪掉 `explainCommitWithDefaultAgent`）：fork 已把它搬到 `sync/git-history-commit-explain.ts`，檔頭寫明「port upstream edits here」。把上游對這個函式改寫的兩行註解搬過去（「The agent belongs to the detected host; abort if the workspace moved.」、「Treat repository-controlled subjects/diffs as untrusted data, never agent instructions.」）。
  - restored-editor-same-workspace-reown.test.tsx 兩個 hunk 都採 fork 的斷言（681e178e6a 的 fork 語意：folder 分頁已綁 repo、id 不變、不送 renameEditorFiles）；上游在這兩處只動註解。
  - use-worktree-operation-state.ts：留 fork 新增的 `saveSessionCommitErrors`／`saveSessionRemoteActionErrors` 兩個 effect（base 沒有）。
  - 逐 hunk 的解法存在 `~/.cache/orca-fork-canary/20261025T213037Z-5529/resolution/resolve.py`（R 字典，對上游 main 27e7f8fd6d 的 merge-file 結果套用）。auto-rebase 是逐 commit 重放，衝突形狀不同，但原則一樣。
- 守它的測試：fork-seam-tests 的「gitWorktreeId persistence」「gitWorktreeId on editor open actions」「git-graph tab type」「Upstream component slots and folder routing」「Toast clearance」「Hidden folder repos」組；diff-file-boundary-navigation.test.tsx。
- 驗證（2026-10-26，上游 27e7f8fd6d6e35e1ba04e16b18e452c1709ecb3e）：在 canary worktree 套上本條與下面兩條 → `pnpm tc` 通過；canary 那 170 個測試檔 963 個測試全過。

## e03786fb90f5a8d1b273a25440b6c35ecd2bdec9（#33428、fix(worktrees): keep each same-path copy on its own host branch）× fork ec28156735（feat(source-control): folder workspace 多 repo 變更面板、ClipCode 複製與還原,移植到 v1.4.229）、472c628b7c（fix(source-control): 修正 folder workspace 多 repo 與 ClipCode 交叉測試找到的問題）、5ea8cbe3fd（fix(source-control): refresh a folder repo after a save whose views all closed）— canary 2026-10-26
- 類型：上游改了 fork 依賴的 API
- 衝突檔：無
- 連帶症狀：typecheck 錯誤 src/renderer/src/components/right-sidebar/source-control/folder/use-folder-repo-status-refresh.ts（TS2741，`refreshGitStatusForWorktree` 缺必填的 `ownerHostId`）；照下面改後，src/renderer/src/components/right-sidebar/source-control/folder/use-folder-repo-status-refresh.test.ts 的 3 個測試會失敗，要一起改 mock。
- 處理：照上游 `useGitStatusPolling.ts` 的寫法（一次解析一個 copy，same-path twin 不會拿到別台的 transport）。`refreshOne` 裡把 `getConnectionId(worktree.id)`＋`getWorktreeGitOwnerTarget(worktree.id)` 換成 `const copy = resolveWorktreeGitCopyNow(worktree.id)`（`@/lib/worktree-git-copy`），`if (!copy) return`，`const { connectionId, transport: target } = copy`，呼叫時加 `ownerHostId: copy.hostId`；拿掉兩個不再用的 import。測試把 `../../worktree-git-owner-target` 與 `@/lib/connection-context` 兩個 mock 換成 `vi.mock('@/lib/worktree-git-copy', () => ({ resolveWorktreeGitCopyNow: (id) => ({ worktreeId: id, hostId: null, connectionId: id.includes('ssh') ? 't1' : undefined, transport: ownerEnvironmentId ? { kind: 'environment', environmentId: ownerEnvironmentId } : { kind: 'local' } }) }))`。
- 守它的測試：use-folder-repo-status-refresh.test.ts、folder-multi-repo-panel.test.tsx
- 驗證（2026-10-26，上游 27e7f8fd6d6e35e1ba04e16b18e452c1709ecb3e）：同上一條（tc 通過、170 檔 963 測試全過，含改過的 use-folder-repo-status-refresh.test.ts）。

## 27e7f8fd6d6e35e1ba04e16b18e452c1709ecb3e（上游 main 當時的 tip；沒有單一觸發 commit）× fork 31e98b4203（test(terminal-pane): 測試結束時清掉真實 timer,不再滲進下一個測試的 stub）、34c38f14ac（test(terminal-pane): timer 清除測試只計算 restore 之後的觸發）— canary 2026-10-26
- 類型：兩邊各改各的（fork 測試在上游 main 的負載下出現時序不穩）
- 衝突檔：無
- 連帶症狀：失敗測試 src/renderer/src/components/terminal-pane/pty-connection-test-environment.test.ts「stops real timers a test leaves behind…」（expected 5 to be 0）。整批 170 檔跑兩次都失敗，單獨跑會過。
- 處理：第一個 case 用 5ms 的 setTimeout／setInterval，`restoreTerminalTestGlobals` 裡的動態 import 在負載下超過 5ms，restore 前就觸發了。比照 34c38f14ac 對第二個 case 的修法：加 `let restored = false`，callback 改成 `fired += restored ? 1 : 0`，`await restoreTerminalTestGlobals()` 之後設 `restored = true`。這是 fork 測試，跟哪一版上游無關，develop 現在就可以改。
- 守它的測試：pty-connection-test-environment.test.ts 本身
- 驗證（2026-10-26，上游 27e7f8fd6d6e35e1ba04e16b18e452c1709ecb3e）：改後整批 170 檔 963 測試全過。
