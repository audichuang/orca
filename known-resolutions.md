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

## fork 自身問題（待人判斷，auto-rebase 不要照做：folder 層級的外部變更要不要配對到 repo-scoped diff 分頁：兩條路徑不一致）× fork ebae8279bd（folder workspace 多 repo）、a9b651f3b9（folder diff 改用 filePath 比對）— auto-rebase 2026-10-27
- 類型：待人判斷
- 衝突檔：無
- 連帶症狀：無（審查者 C 的 mutation：拿掉 `editor-autosave.ts:177` 的 `getOpenFileGitWorktreeId(file) === target.worktreeId`，所有測試仍綠）
- 處理：`getOpenFilesForExternalFileChange` 的 fallback 路徑（沒有 `indexedOpenFiles` 時）用第 177 行排除「target 是 folder 本身、分頁是 repo-scoped diff」的情境；`editor-external-watch-path-index.ts` 的 index 路徑在同一情境以 `filePath` 配對、會包含它。第 177 行原本是為了 relativePath 撞名（8da7b7c407 之前用 relativePath 比對），現在 scoped 分頁已改用 filePath 比對，這個目的已由第 174 行達成。要使用者決定：刪掉第 177 行（跟 index 路徑一致），或讓 index 路徑也排除；決定後在 `editor-autosave.fork.test.ts` 補一個會咬的測試。不要在 auto-rebase 裡自己選一邊。
- 守它的測試：待補（editor-autosave.fork.test.ts）
- 驗證：未驗證（只有讀程式碼與 C 的 mutation 結果）

## fork 自身問題（上游新的 WSL 搬移匯出不改寫 fork 的 `gitWorktreeId`）× fork ebae8279bd（folder workspace 多 repo）— auto-rebase 2026-10-29
- 類型：fork 自身問題
- 衝突檔：無
- 連帶症狀：無（測試全綠）。v1.4.244 rebase 的審查者 B 與 Codex 找到：上游 v1.4.244 大幅擴充 `src/main/persistence/moving-wsl-projects/*`，匯出（`wsl-move-manifest-export.ts:166`）依 `src/main/ssh/orcad-migration-path-fields.ts:62` 的欄位表改寫 open file 的 `filePath`、`worktreeId`，表裡沒有 fork 的 `gitWorktreeId`（`workspace-session-editor-schema.ts:12`）。Codex 暫加案例實測：匯出後 `gitWorktreeId` 還是 Windows UNC 形式的舊 id（應為 `app::/home/me/app`），交給 `hydrateEditorSession` 後 editor 失去 `gitWorktreeId`。
- 處理：在 `orcad-migration-path-fields.ts` 的欄位表加 `gitWorktreeId`（照 `openFilesByWorktree{}[].worktreeId` 那筆的寫法），補 fork 測試（sibling `.fork.test.ts`）：exporter 會改寫 `gitWorktreeId`、hydration 後保留。新搬移在 `ORCA_INTERNAL_WSL_HOSTS=1` 後面、預設關閉，所以這次不擋 rebase；auto-rebase 照這條做算 MANUAL，要 mutation 證明（拿掉欄位表那筆要紅）。上游之後改這張表的結構就以眼前為準。
- 守它的測試：待補（上面的 fork 測試）
- 驗證：未驗證（只有 Codex 暫加案例的結果）

## fork 自身問題（`config/fork-seam-tests.txt` 漏列兩個守 seam 的測試）× fork 222b87e964（補上游接縫的非 UI 契約測試）、b59f93a250（ClipCode 搬進 fork slots）— auto-rebase 2026-10-29
- 類型：fork 自身問題
- 衝突檔：無
- 連帶症狀：無。v1.4.244 rebase 審查者 C2 的 mutation：`file-diff.ts` catch 區把兩邊標成 missing，只有 `src/main/git/source-control/file-diff.read-failure.test.ts` 會紅；`branch-entry-row.tsx` 的 `viewItems` slot 只有 `src/renderer/src/components/right-sidebar/source-control/listing/source-control-entry-context-menu.fork.test.tsx` 會紅。兩個都不在 seam 清單，`make fork-check-seams` 跑不到（CI 的完整單元測試會跑）。
- 處理：`file-diff.read-failure.test.ts` 加進 `blob-absence-real-git.fork.test.ts` 那組，`source-control-entry-context-menu.fork.test.tsx` 加進「Upstream component slots and folder routing」組。只改 `config/fork-seam-tests.txt`；`fork-check-lint` 會檢查路徑存在、不重複。
- 守它的測試：`make fork-check-seams`、`fork-check-lint` 的 seam 清單檢查
- 驗證：未驗證

## edc0373fcdec9f71e768597a0e7314420b6fa1de（#35470、plugins: Plugin Alpha）× fork e2890aaf65（fix(source-control): 依第二輪 QA 修正:combined diff 在 dev StrictMode 不再 crash、多選複製 hash/訊息涵蓋全部選取、Git Graph 可在旁邊開 diff）、ddbc9e1cdb（fix(source-control): 修正 folder workspace 多 repo 與 ClipCode 交叉測試找到的問題）、ebae8279bd（feat(source-control): folder workspace 多 repo 變更面板、ClipCode 複製與還原,移植到 v1.4.229）、c547fd16a2（refactor(editor): move the saved-file dispatch out of editor-save-queue.ts）、f7f0e48267（fix(source-control): refresh a folder repo after a save whose views all closed）、3d46ed12bc（feat(source-control): Git Graph 改成編輯器分頁,可切換 repo,並加上快捷鍵與 Cmd+J 進入點）、7b803e9325（refactor(git-graph-tab): route upstream editor-kind sites through fork-editor-tab-kinds）— canary 2026-10-30
- 類型：兩邊各改各的（另含上游改了 fork 測試依賴的 Monaco API、上游把 EditorFileTab.tsx 長到剛好 400 行）
- 衝突檔：.oxfmtrc.json、src/renderer/src/components/editor/{DiffSectionBody.tsx（2 個 hunk）,DiffSectionBody.word-wrap-lifecycle.test.tsx,DiffViewer.tsx,EditorPanel.tsx,editor-save-queue.ts}、src/renderer/src/components/tab-bar/EditorFileTab.tsx。EditorPanel.tsx 另有上游 f245dc752157c0109d0fd959ec3c9a77f8b6f16d（#35647）、1bd7f547121f2c16dbc59a8a044ae961fced3b9a（#34898），editor-save-queue.ts 另有 a871bca8f710494e4f191a384292c12201c8148f（#35057），但衝突 hunk 都只在 Plugin Alpha 的 import 區。
- 連帶症狀：失敗測試 src/renderer/src/components/editor/DiffSectionBody.monaco-strict-reveal.test.tsx（2 例；合好後仍紅：`TypeError: model.isDisposed is not a function` at `applyModelLanguage`）、editor-file-saved-event.contract.test.ts、src/renderer/src/components/tab-bar/EditorFileTab.fork.test.tsx、src/shared/fork-editor-kind-sites.guard.test.ts；合好後上游 lint 的 `oxlint` 報 `EditorFileTab.tsx` `max-lines`（401 > 400）
- 處理（全部 import 區兩邊都留，順序：上游在前、fork 接後）：
  - .oxfmtrc.json：採上游 `ignorePatterns`（plugin 那 6 行），最後一行 `"docs/reference/plugin-theme-tokens.md"` 補逗號，再接 fork 的 `"src/renderer/src/components/right-sidebar/source-control/clipcode/__fixtures__/clipcode-clipboard-contract.json"`。
  - DiffSectionBody.tsx：import 採上游的 `usePluginSyntaxLanguage`／`PLUGIN_SYNTAX_EDITOR_OPTIONS, applyModelLanguage`／`useMonacoTheme` 三段，**不要**上游的 `const ImageDiffViewer = lazy(...)`（fork 已把 `lazyWithRetry` import 拿掉、改從 `./editor-lazy-views` 取），接 fork 的 `import { ImageDiffViewer } from './editor-lazy-views'`、`import { deferDiffEditorDispose } from './monaco-diff-editor-deferred-dispose'`；mount 處先上游 `applyModelLanguage([...], language)` 再 fork `cancelPendingDisposeRef.current = deferDiffEditorDispose(diffEditor)`。
  - DiffSectionBody.word-wrap-lifecycle.test.tsx：假 editor 兩行都留：`getModel: () => null,`、`dispose: vi.fn(),`。
  - DiffViewer.tsx：採上游三段 import（上游拿掉了 `useDocumentDarkTheme`），接 fork 的 `import { syncKeptModelValue } from './diff-kept-model-sync'`。
  - EditorPanel.tsx：上游 `useFileCustomEditors`、`applyCustomEditorToggle` 兩行接 fork 的 `getOpenFileGitWorktreeId` import。
  - editor-save-queue.ts：寫成 `import { isAutosaveSuspendedForFile, normalizeAutoSaveDelayMs } from './editor-autosave'`、`import { dispatchEditorFileSaved } from './editor-file-saved-dispatch'`、`import { flushEditorViewsForSave, hasPendingEditorBufferChange } from './editor-pending-flush'`（上游把 `flushPendingEditorBuffer` 換成 `flushEditorViewsForSave`；fork 的事件已搬到 editor-file-saved-dispatch.ts，上游這次沒改 dispatch 區塊）。
  - EditorFileTab.tsx：上游加了 `tabIcon`／`PluginContributionIcon`，fork 的 `forkEditorTabIcon` import 會把檔推到 401 行。照 FORK.md max-lines 規則把上游的 `HoverIcon` 三元鏈搬到新檔 `src/renderer/src/components/tab-bar/editor-file-tab-hover-icon.ts`（開頭註明「Moved from EditorFileTab.tsx…」，`editorFileTabHoverIcon(mode, fileIcon)`，fork 的 `forkEditorTabIcon(mode) ?? fileIcon` 在鏈尾、import `git-graph-editor-surfaces` 讓 guard 認得）；EditorFileTab.tsx 刪掉 `isDiff`、`isCheckDetails` 與 fork 的 import，lucide 只留 `Eye, ShieldAlert, Pin`，`const HoverIcon = editorFileTabHoverIcon(file.mode, FileIcon)`，import 新檔。
  - fork 測試 DiffSectionBody.monaco-strict-reveal.test.tsx：`FakeModel` 加 `isDisposed: () => boolean`、`getLanguageId: () => string`，`createModel(_value, language, uri)` 回傳的物件加 `isDisposed: () => !models.has(uri)`、`getLanguageId: () => language`（額外 commit 或併進 rebase 的衝突解）。
  - 合好的檔在 `~/.cache/orca-fork-canary/20261029T213126Z-45236/resolution/files/`（整份 diff：同目錄上一層的 `resolution.diff`）；vNEW 跟上游 main 不同時照上面的描述做，不要直接複製。
- 守它的測試：DiffSectionBody.monaco-strict-reveal.test.tsx、DiffSectionBody.word-wrap-lifecycle.test.tsx、editor-file-saved-event.contract.test.ts、EditorFileTab.fork.test.tsx、fork-editor-kind-sites.guard.test.ts、上游 lint 的 `oxlint`（max-lines）、`pnpm tc`
- 驗證（2026-10-30，上游 4217095c06e684c6463eac026c28c807c4021a18）：在 canary worktree 套上本次全部條目後 `pnpm tc` 通過；canary 那 176 個測試檔 1003 個測試全過；fork seam 清單＋相關目錄 155 檔 1106 測試全過；上游 lint 37 步只剩 `oxlint` 因上游自己的超長測試檔紅（見「上游自己就紅」那條）；`fork-locale-parity.mjs HEAD`、`fork-upstream-api.mjs HEAD` 通過。

## 8c3551bde3bb6fe872f6570dbb17b2ccf76c1454（#35410、fix(wsl): background Git, GitHub and GitLab reads never start a stopped distro; explicit opens may (E9)）、cd821abb2cac5d0ef7438ed0bc28bc975395b88b（#35854）、38c111697ace6aa1a8a632ab4580cf6eecc8bfc4（#35897）× fork ddbc9e1cdb（fix(source-control): 修正 folder workspace 多 repo 與 ClipCode 交叉測試找到的問題）、52a8fcc0de（refactor: carry fork values in options objects instead of trailing positional params）、8b9f9f9110（feat(source-control): git 歷史支援多分支、分支篩選與 git 端搜尋(後端)）、a9b651f3b9（fix(source-control): folder 分頁的 git/讀檔改由 filePath 推導 repo 相對路徑，還原時丟掉失效 git owner 會重算 relativePath）、acd2096a4f（feat(source-control): Commits 區的分支篩選、git 端搜尋、載入更多與複製 commit 異動）、af35a8efa0（feat(source-control): Git Graph 版面讓出訊息空間、分頁篩選獨立並預設全部分支）、f99ac7c313（feat(source-control): 側邊欄與 Git Graph 同步選中 repo,加 Show in Git Graph 與在 Source Control 開啟）— canary 2026-10-30
- 類型：兩邊各改各的（上游把 git diff／history 讀取包進 `readWorktreeGitUnlessWslStopped`、加 `wakeWslDistro` 參數；fork 在同一處帶 `skipRenderLimit`／`graph`）
- 衝突檔：src/main/ipc/filesystem/filesystem-git-status-handlers.ts、src/renderer/src/runtime/runtime-git-diff-client.ts（2 個 hunk）、src/renderer/src/components/right-sidebar/source-control/sync/use-git-history.ts（3 個 hunk）、src/renderer/src/components/editor/useEditorPanelDiffContentLoader.ts（import 區，另含 62314930c4f79cbbbbeb6d1ce8cc28856546d9e3 #35440 的 `translate`）
- 連帶症狀：typecheck 錯誤 src/renderer/src/runtime/runtime-git-diff-skip-render-limit-client.test.ts（`skipRenderLimit` 不存在）、src/renderer/src/components/git-graph-tab/GitGraphTabView.tsx（`graphFilterKey` 不存在）；失敗測試 runtime-git-diff-skip-render-limit-client.test.ts、src/main/ipc/filesystem/{filesystem-git-diff-skip-render-limit-ipc,filesystem-git-history-graph-ipc}.test.ts、src/renderer/src/components/git-graph-tab/GitGraphTabView.component.test.tsx、src/renderer/src/components/right-sidebar/source-control/sync/{git-graph-full-view,git-history-graph}.component.test.tsx、src/renderer/src/components/editor/folder-relative-git-consumers.test.tsx（全部是衝突重設造成，合好就過）
- 處理：
  - filesystem-git-status-handlers.ts：衝突區（fork 的舊 `return getDiff(...)`）整段丟掉，採上游 `readWorktreeGitUnlessWslStopped(...)` 結構，在它的 `getDiff` options 物件寫 `{ ...gitOptions, admissionTier: 'interactive', skipRenderLimit: args.skipRenderLimit }`（`args` 型別裡的 `skipRenderLimit?: boolean` 已自動合入）。
  - runtime-git-diff-client.ts：簽章用 fork 的多行 `args`（含 `skipRenderLimit?: boolean`）後接上游的 `, options?: GitDiffWakeOptions`；local 分支物件寫 `skipRenderLimit: args.skipRenderLimit,`、`connectionId: context.connectionId,`、`...localWakeArgs(context, options)`。
  - use-git-history.ts：merge-file 對不齊（上游把 `refreshGitHistory` 改成帶 `options` 的多行 `useCallback`），**採上游檔再把 fork 的改動加回**：react import 加 `useMemo`；上游 `takeRecentWorkspaceSwitchWake` import 後加 `import { toGitHistoryGraphRequest, useGitHistoryGraphFilter } from './git-history-graph-filter'`；參數解構加 `graphFilterKey,`、型別加 `/** Fork: the Git Graph tab's own filter key; defaults to the worktree's. */ graphFilterKey?: string`；`ownerHostKey` 後加 fork 的兩行 `graphFilter`／`graphRequest`（含 `// Fork:` 註解）；`getRuntimeGitHistory` 第二個參數在 `baseRef: compareBaseRef,` 後加 `...(graphRequest ? { graph: graphRequest } : {}),`（在上游的 `wakeWslDistro` 展開之前）；`refreshGitHistory` 與下面 effect 的依賴陣列都在 `compareBaseRef,` 後加 `graphRequest,`。
  - useEditorPanelDiffContentLoader.ts：import 兩邊都留（上游 `translate`、`isWslDistroNotRunningRefusal` 在前，fork 的 `getOpenFileGitRelativePath, getOpenFileGitWorktreeId` 在後）。
  - 合好的檔在快取（同上一條）。
- 守它的測試：上面列的失敗測試（fork-seam-tests 的 skipRenderLimit 組、git history graph 組），以及 `pnpm tc`
- 驗證（2026-10-30，上游 4217095c06e684c6463eac026c28c807c4021a18）：同上一條。

## 08e5522b9a1da34ded8318c701b5cf82eaa6b7e1（#35994、feat(browser): add a shortcut to open a browser tab in a split to the right）、79dbada2c873bef3584a0c53b23ae98f2a84e536（#35443、fix(i18n): localize sidebar, status bar, tab bar and workspace cleanup copy）× fork 3d46ed12bc（feat(source-control): Git Graph 改成編輯器分頁,可切換 repo,並加上快捷鍵與 Cmd+J 進入點）— canary 2026-10-30
- 類型：兩邊各改各的（另含上游改了 fork 依賴的 API：Cmd+J 不可用訊息改成 `translate`）
- 衝突檔：src/renderer/src/components/cmd-j/quick-action-context.ts（2 個 hunk：import 區、`getUnavailableQuickActionMessage` 的 switch）
- 連帶症狀：typecheck 錯誤 src/renderer/src/components/cmd-j/git-graph-quick-action.ts、git-graph-quick-action.test.ts（`canOpenGitGraph`／`openGitGraph` 不存在、`'no-git-repo'` 不屬於 `CmdJUnavailableReason`，衝突重設造成）
- 處理：import 兩邊都留（上游 `import type { TabSplitDirection } …` 在前、fork `buildGitGraphQuickActionContext` 在後）。switch 採上游的 `translate(...)` 寫法（上游改成引號包住 localized title、不再 `toLowerCase()`），fork 的 case 跟著改：`case 'no-git-repo': return translate('auto.components.cmdJ.quickActionUnavailable.noGitRepo', 'Can’t run “{{action}}” — no Git repository is available.', options)`（彎引號同上游）。**額外 commit**：11 個語系的 `auto.components.cmdJ.quickActionUnavailable` 在 `"clientUnsupported"` 後面加 `"noGitRepo"`，譯文表在 `~/.cache/orca-fork-canary/20261029T213126Z-45236/resolution/locale-translations/noGitRepo.json`（en／de／es／fr／ja／ko／pt／ru／tr／zh／zh-Hant，由 canary 照各語系既有 `noMovableChat`／`clientUnsupported` 的句型翻，沒有人工校對）。
- 守它的測試：git-graph-quick-action.test.ts、`pnpm tc`、`fork-locale-parity.mjs`（174 個 fork key）
- 驗證（2026-10-30，上游 4217095c06e684c6463eac026c28c807c4021a18）：tc 通過、`fork-locale-parity.mjs HEAD` 通過（`174 fork keys present in every locale`）、上游 lint 的 `verify:localization-*` 通過；其餘同第一條。

## ec4d46f4f07d04968d8da4f1d764d02528c26e80（#35748、Use the shared default agent selection for work-item launches）× fork 52a8fcc0de（refactor: carry fork values in options objects instead of trailing positional params）、4e4a7ffdac（fix(source-control): judge Explain commit and CLI-argument visibility at the folder repo launch）— canary 2026-10-30
- 類型：兩邊各改各的（上游把 `resolveDefaultAgentForNewTab` 的主體抽成 `resolveDefaultAgentForWorkspace`，`chatIn` 改帶 `workspace`）
- 衝突檔：src/renderer/src/lib/agent-tab-shortcuts.ts
- 連帶症狀：typecheck 錯誤 src/renderer/src/components/right-sidebar/source-control/sync/git-history-commit-explain.ts、src/renderer/src/lib/folder-repo-launch-chat-route.test.ts（`Expected 2 arguments, but got 3`：fork 的 `launchAt` 參數被衝突重設拿掉）；失敗測試 folder-repo-launch-chat-route.test.ts
- 處理：採上游結構；fork 的 `cwd` 一路帶下去：`resolveDefaultAgentForWorkspace` 的 `chatIn` 型別寫 `{ store: AgentLaunchRouteStore; workspace: ProspectiveWorkspace; cwd?: string | null }`；`resolveDefaultAgentForNewTab` 傳 `chatIn: chatIn && { store: chatIn.store, workspace: worktreeLaunchWorkspace(chatIn.worktreeId), cwd: chatIn.cwd }`；`chosenUsable` 呼叫 `agentChoiceMayOpenAsChat(chatIn.store, agent, chatIn.workspace, args.detectedAgentIds ?? null, { cwd: chatIn.cwd })`，`pickTuiAgent(args.defaultTuiAgent, …)` 照上游。上游新的呼叫者 `launch-work-item-direct-*.ts` 不帶 `cwd`，不用改。
- 守它的測試：folder-repo-launch-chat-route.test.ts（fork-seam-tests「Agent launch cwd in folder repos」組）、`pnpm tc`
- 驗證（2026-10-30，上游 4217095c06e684c6463eac026c28c807c4021a18）：同第一條。

## ec58374a4c9a0ada905c4bd625067646c0971593（#35992、fix(browser): Orca's own buttons and links open per the open-links-in-Orca setting）× fork ebae8279bd（feat(source-control): folder workspace 多 repo 變更面板、ClipCode 複製與還原,移植到 v1.4.229）— canary 2026-10-30
- 類型：兩邊各改各的（上游把 `window.api.shell.openUrl` 換成 `openAppHttpLink(url, { worktreeId })`；fork 改了開 PR 頁的條件）
- 衝突檔：src/renderer/src/components/right-sidebar/source-control/review/use-hosted-review-creation.ts（2 個 hunk）
- 連帶症狀：無測試紅；合好後上游 lint 的 `oxlint` 報這個檔 `max-lines`（302 > 300）
- 處理：import 兩邊都留（上游 `openAppHttpLink` 在前、fork `useSourceControlWorktreeScope` 在後）。fork 的 `foregroundWorkspaceId` 改名 `foreground`（全檔 3 處＋依賴陣列），讓條件收回一行：`if (createdReviewIsForeground(foreground) && resolvedPrCreationDefaults.openAfterCreate) {` 後接 `openAppHttpLink(result.url, { worktreeId: foreground })`；上游自動合入的「already open」toast 那行 `openAppHttpLink(result.existingReview!.url, { worktreeId: activeWorktreeId })` 也改成 `{ worktreeId: foreground }`（folder workspace 的 `activeWorktreeId` 是 repo 的 git id、不是有瀏覽器分頁的 workspace，傳它會退回系統瀏覽器）。這樣檔案 299 行。
- 守它的測試：use-hosted-review-creation.test.tsx（上游）；folder 情境的 `{ worktreeId: foreground }` 沒有測試守（既有缺口，未補）
- 驗證（2026-10-30，上游 4217095c06e684c6463eac026c28c807c4021a18）：tc 通過、use-hosted-review-*.test.tsx 通過、`oxlint` 這個檔不再報 max-lines；其餘同第一條。

## 62314930c4f79cbbbbeb6d1ce8cc28856546d9e3（#35440、fix(i18n): localize plurals, sentence fragments and hardcoded copy in editor, chat, skills and onboarding）× fork ebae8279bd（feat(source-control): folder workspace 多 repo 變更面板、ClipCode 複製與還原,移植到 v1.4.229）— canary 2026-10-30
- 類型：兩邊各改各的
- 衝突檔：src/renderer/src/components/editor/combined-diff/scroll-viewport/combined-diff-section-list.tsx（import 區）
- 連帶症狀：無
- 處理：兩行都留：上游 `import { translate } from '@/i18n/i18n'` 在前、fork `import { getOpenFileGitWorktreeId } from '@/store/slices/editor/git/open-file-git-owner'` 在後。
- 守它的測試：`pnpm tc`
- 驗證（2026-10-30，上游 4217095c06e684c6463eac026c28c807c4021a18）：同第一條。

## d6e80dab06ea9df5418907470d1bdc4cf182325d（#34903、fix(editor): bound retired content ID tracking）、62314930c4f79cbbbbeb6d1ce8cc28856546d9e3（#35440）、edc0373fcdec9f71e768597a0e7314420b6fa1de（#35470）、51b1e0f20c24846f7d066e147b16818bff8a9310（#35611、fix(editor): retain combined diff bodies on metadata updates）× fork a9b651f3b9（fix(source-control): folder 分頁的 git/讀檔改由 filePath 推導 repo 相對路徑，還原時丟掉失效 git owner 會重算 relativePath）、ebae8279bd（feat(source-control): folder workspace 多 repo 變更面板、ClipCode 複製與還原,移植到 v1.4.229）、52a8fcc0de（refactor: carry fork values in options objects instead of trailing positional params）— canary 2026-10-30
- 類型：上游改了 fork 依賴的 API（上游把兩個檔長到上限邊緣，fork 的行推過 `max-lines`）
- 衝突檔：無（自動合併）
- 連帶症狀：上游 lint 的 `oxlint`：`src/renderer/src/components/editor/useEditorPanelFileContentLoader.ts`（307 > 300；上游自己 299）、`src/renderer/src/components/editor/combined-diff/CombinedDiffViewer.tsx`（401 > 400）
- 處理（FORK.md：先搬 fork 的程式）：
  - 新 fork 檔 `src/renderer/src/components/editor/editor-file-read-git-owner.ts`：`fileReadGitOwner(restoredOpenFile, worktreeId, relativePath, options)` 回 `{ worktreeId: options?.gitWorktreeId ?? (restoredOpenFile ? getOpenFileGitWorktreeId(restoredOpenFile) : worktreeId), relativePath: restoredOpenFile ? getOpenFileGitRelativePath(useAppStore.getState(), restoredOpenFile) : relativePath }`。loader 刪掉 `open-file-git-owner` 的 4 行 import 與 `let readRelativePath` 三行，`translate` import 後加 `import { fileReadGitOwner } from './editor-file-read-git-owner'`，`readConnectionId = connectionId` 後寫 `const gitOwner = fileReadGitOwner(restoredOpenFile, worktreeId, relativePath, options)`、`let readWorktreeId = gitOwner.worktreeId`，`readArgs` 寫 `relativePath: gitOwner.relativePath`。結果剛好 300。
  - CombinedDiffViewer.tsx：`openAlternateDiff` 裡 `if (!file.combinedAlternate) { return }` 後加 `const gitOwner = { gitWorktreeId: file.gitWorktreeId }`，`openAllDiffs(file.worktreeId, file.filePath, undefined, undefined, undefined, gitOwner)` 收成一行、`openBranchAllDiffs` 最後一個參數改 `gitOwner`。結果剛好 400。
  - 兩個都剛好在上限：vNEW 若又多幾行，照 FORK.md 把一段上游程式搬到新檔（開頭註明從哪裡搬來）。快取裡有兩個檔的成品。
- 守它的測試：folder-relative-git-consumers.test.tsx（拿掉 `fileReadGitOwner` 的 `options?.gitWorktreeId ??` → `× reads through the requested git owner when no open tab carries one`，canary 實測）、上游 lint 的 `oxlint`
- 驗證（2026-10-30，上游 4217095c06e684c6463eac026c28c807c4021a18）：兩個檔 `oxlint` 不再報 max-lines；上面的 mutation 實測會紅；其餘同第一條。

## 85a1d7ba049ce6ff04a57cef05f5c38d820d28ec（#34275、Keep action model and effort choices out of Arguments）× fork da3e789505（test(source-control): pin a recovery agent launch from a folder to the folder workspace）、b925671afe（fix(source-control): judge chat eligibility with the folder repo launch's start directory）、74c2f084f8（test(source-control): pin the dialog's interactive start at the folder repo directory）、b784fd791b（fix(source-control): route folder repo AI conflict starts through upstream's saved-start path）— canary 2026-10-30
- 類型：上游改了 fork 依賴的 API（`getLaunchActionRecipe` 要回 `SelectedSourceControlActionRecipe`；`useSavedSourceControlActionStart().start` 拿 `selection: CurrentActionSelection`，不再收 `recipe`）
- 衝突檔：無
- 連帶症狀：typecheck 錯誤 src/renderer/src/components/right-sidebar/source-control/ai/recovery-launch.folder-cwd.test.ts（TS2322）、src/renderer/src/components/right-sidebar/SourceControlAgentActionDialog.folder-cwd.test.tsx（TS2353 `'recipe' does not exist`）；失敗測試同這兩個檔
- 處理（只改 fork 測試，額外 commit）：recovery-launch.folder-cwd.test.ts import `sourceControlActionRecipeEntry`（`../../../../../../shared/source-control-action-selection`），`getLaunchActionRecipe: () => sourceControlActionRecipeEntry({ agentId: 'codex', commandInputTemplate: '{basePrompt}' })`（上游 use-ai.operation-recovery.test.tsx 的寫法）；SourceControlAgentActionDialog.folder-cwd.test.tsx import `canonicalSourceControlActionSelection`（`../../../../shared/source-control-action-selection`），`recipe: {…}` 改 `selection: canonicalSourceControlActionSelection({ agentId: 'antigravity', agentArgs: '--saved' })`。
- 守它的測試：這兩個測試檔（fork-seam-tests「Agent launch cwd in folder repos」組）
- 驗證（2026-10-30，上游 4217095c06e684c6463eac026c28c807c4021a18）：兩檔通過、tc 通過。

## 300b241fc698312691ba77820bd236eaad7227a4（#35671、fix(i18n): format renderer dates and numbers in the UI language）× fork 56b5bcd8f4（feat(git-graph): make commit messages easier to scan in the full view）— canary 2026-10-30
- 類型：上游改了 fork 依賴的 API（上游新 ast-grep 規則 `renderer-intl-ui-locale` 不准 renderer 用 `new Intl.DateTimeFormat(undefined, …)`）
- 衝突檔：無
- 連帶症狀：上游 lint 的 `lint:ast-grep-gates` 紅：src/renderer/src/components/right-sidebar/source-control/sync/git-graph-date-format.ts 4 處（第 11、17、22、26 行）
- 處理（額外 commit）：照上游做法改用 `uiDateTimeFormat`（`@/i18n/ui-intl-formatters`，以 options 物件為 key 快取、換語言重建）：四個模組層 formatter 改成 `SHORT_DATE_OPTIONS`／`PADDED_DATE_OPTIONS`／`PADDED_MONTH_DAY_OPTIONS`／`PADDED_TIME_OPTIONS: Intl.DateTimeFormatOptions` 常數，呼叫處寫 `uiDateTimeFormat(<常數>).format(date)`。順帶修正 fork 的日期原本跟 OS 語系、不跟 UI 語言。
- 守它的測試：上游 lint 的 `lint:ast-grep-gates`；git-graph-full-row.component.test.tsx
- 驗證（2026-10-30，上游 4217095c06e684c6463eac026c28c807c4021a18）：`lint:ast-grep-gates` 通過、git-graph 相關測試通過。

## 06c3443ab5df35bfd44050fa10e8bb0543945bb0（#35416、fix(i18n): localize right sidebar, GitHub and PR page leftovers）× fork 89ad264584（refactor(ui-rounds): call shared helpers instead of per-group wrappers）、948873af86（test(ui-rounds): keep the hands-on UI round scripts in the repo）— canary 2026-10-30
- 類型：上游改了 fork 依賴的 API（Abort 確認鈕從樣板 `` `Abort ${label}` `` 改成整句 key `'Abort merge'`／`'Abort rebase'`）
- 衝突檔：無
- 連帶症狀：失敗測試 config/scripts/ui-rounds-map.test.mjs（`tests/ui-rounds/cases/sc-errors-history.mjs: "Abort"`）
- 處理（額外 commit）：sc-errors-history.mjs 的 `await scConfirm(/^按鈕 Abort( merge)?$/, 3000)` 改成 `/^按鈕 Abort merge$/`（確認鈕的字一直都是「Abort merge」）。
- 守它的測試：ui-rounds-map.test.mjs
- 驗證（2026-10-30，上游 4217095c06e684c6463eac026c28c807c4021a18）：ui-rounds-map.test.mjs 通過；實際 UI round 沒跑（未驗證）。

## 63f6d838fb689983ad009e674b9a5232aba60698（#36087）＋ be4b3ffad3156983224ff56f4bcb7a8e4e2acacc（#36096）、cb21824bd956ef6fec14afba6dfe65c735ee8b9f（#36047）＋ 2e38249a7d55b626321e48d882d5a5829010e2f8（#31208）× 無 fork commit — canary 2026-10-30
- 類型：上游自己就紅；auto-rebase 不用處理
- 衝突檔：無
- 連帶症狀：typecheck 錯誤 src/renderer/src/components/browser-pane/describe-page/browser-page-types.ts（TS2300 `Duplicate identifier 'BrowserPageGrabAnnotations'`：兩個 PR 各加了一份一模一樣的型別）；上游 lint 的 `audit:anti-slop`、`audit:code-quality:type-aware`、`lint:js-plugins`、`oxlint`、`check:dead-classes`、`audit:code-quality:native` 全因同一個重複宣告紅；`oxlint` 另報 src/renderer/src/components/native-chat/native-chat-subscriptions.performance.test.tsx `max-lines`（833 > 800；fork 沒碰這個檔）
- 處理：不用 fork 處理。截至上游 origin/main f9a21bcfff 兩處都還沒修；canary 驗證時在 worktree 刪掉第二份（相同的）型別宣告才讓 tc 過。vNEW 若含這些 commit 而上游還沒修，就是上游 release 自己紅（`fork-upstream-red.mjs vNEW` 會列出），照 auto-rebase 處理上游既有紅的規則，不要在 fork 裡修。
- 守它的測試：無
- 驗證（2026-10-30，上游 4217095c06e684c6463eac026c28c807c4021a18）：`git show HEAD:browser-page-types.ts` 就有兩份宣告；`native-chat-subscriptions.performance.test.tsx` 合併結果與上游逐位元組相同。

## 4cee4b1ba63033d4a76c8c8c8091319ed579a20e（#35809）、a50a44bb8df9a193b91afb8c54d11a4ad99f1c14（#35597）、3ce252c79a26889ff10dd303796adda3c3e1e959（#35652）、006bbb28e79172116053b2b6f64fcfcdc1044ed4（#34906）、5616230ecdad2a80cc00412867c531a56d9d150c（#35517）、12a7d4c13a60c81e5e12c9f76e101357b3ee7a51（#35399）、79ba74dc3866218f30211bfd9bb032bb1ea4c870（#35619）、7980f2c23f1b5304890793ab133bd5c1d721bc42（Fix mobile download button destination）、ec58374a4c9a0ada905c4bd625067646c0971593（#35992）× 無 fork commit — canary 2026-10-30
- 類型：上游自己（release 分支與 main 各改一次）；auto-rebase 不用處理
- 衝突檔：.github/workflows/pr.yml、src/renderer/src/components/mobile/use-mobile-install-actions.ts（報告的 fork 欄空白）
- 連帶症狀：無
- 處理：v1.4.244 的 f37e6b2c0c（ci: sync release workflows with main for the v1.4.244 cut）、c36ea7e969（#35619 在 release 分支的版本）、a61f37803c（Fix mobile download button destination 的 release 版本）在 merge-base b378dd183a 之後，fork 版這兩個檔與 v1.4.244 逐位元組相同（`git diff --quiet v1.4.244 fork/develop -- <檔>`），所以只是 canary 把整個 develop（含 v1.4.244）合進 main 才出現的衝突；canary 重設成上游 main 就是正解。auto-rebase 只重放 `vOLD..develop` 的 fork commit，不碰這兩個檔。與 resolution-history 裡 8d908764dc 那條同型：之後 canary 看到 fork 欄空白、檔案在 vOLD 的 release 分支 commit 裡的衝突，就歸這條。
- 守它的測試：無
- 驗證（2026-10-30，上游 4217095c06e684c6463eac026c28c807c4021a18）：兩個檔 `git diff --quiet v1.4.244 MERGE_HEAD` 成立；採上游後 tc 與測試全過。
