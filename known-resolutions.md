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
- 上游的修正（canary 2026-10-28）：a93e31a93395953b795e9f5098a6b93c8ee331af（#33799、perf(renderer): keep modal blur with independent source regions）刪掉了這行 import；上游 main 54411a9a96 上 `pnpm tc` 已無此錯。canary 時兩者都還不在任何 release tag。auto-rebase 時：vNEW 含 a93e31a933 → 不用處理，條目搬進 history；vNEW 含 b7fb07c379 而不含 a93e31a933 → a93e31a933 改了 13 個檔（含 e2e），不要整個 cherry-pick，照上面「只刪這行 import 的 fork commit」做。
- 驗證（2026-10-27，上游 b7fb07c379383d2bc6b17ca08f742ce855bd605a）：套上其他條目後 `pnpm tc` 只剩這一個錯；`git show origin/main:<檔>` 裡 `StructuredChatPaneMenuItems` 只出現在 import 那一行。

## f34c13ca1ece8369f0d2bcfa8d4547526a247100（#33889、test: remove low-value main-process suites and browser probes）、ad2156c358487d9ddebf1f5b6faad0aa0c90e359（#34062、test: remove 140 low-value cases and 49 suites）× fork a6a4352e8a、dfb4a446e8（這兩個 commit 自己的 cherry-pick）— auto-rebase 2026-10-27
- 類型：上游修了同一件事
- 衝突檔：可能有 .github/workflows/pr.yml（只對 #33889 那個）。canary 2026-10-28 對上游 main 試合時（兩個 cherry-pick 被當成 fork 改動），衝突在 config/reliability-gates.jsonc（1 個 hunk，上游之後再改了同一行）與 src/main/ipc/pty/pane/terminal-spawn-restore.test.ts（fork 刪、上游 5ad2d09ee4 #34172 再改）：兩個都採上游版即可，跟「丟掉這兩個 cherry-pick」的結果相同。
- 連帶症狀：canary 報告的「Fork tests the merged tree no longer runs」列出 src/main/runtime/orca-runtime-tests/terminal-workspace-id-env.spec.ts、src/main/runtime/runtime-terminal-client-use.spec.ts：這兩個是上游檔，只因 dfb4a446e8 跟上游一樣刪了幾行而被算成 fork 測試，不是 fork 的問題；丟掉 cherry-pick 後就不會再列。
- 處理：v1.4.242 過不了 `check:test-file-runners`（`ci-unit-files.mjs` 列了 browser-route-{tcp-egress,h3-egress,dns-prefetch}.electron.test.ts，pr.yml 卻已經不跑），auto-rebase v1.4.242 用 `cherry-pick -x` 把這兩個上游 main commit 帶進 develop（標題與上游相同，訊息有 `(cherry picked from commit …)`）。#33889 那個在 pr.yml 衝突時採了 v1.4.242 那側（v1.4.242 的 pr.yml 已經沒有那三行），所以它的 patch 比上游少一個 pr.yml hunk，patch-id 對不上，rebase 到含 f34c13ca1e 的 release 時**不會**自動略過：可能空掉（`--empty=drop` 會丟）或在 pr.yml／被刪的檔衝突。適用條件 `git merge-base --is-ancestor f34c13ca1ece8369f0d2bcfa8d4547526a247100 vNEW`：成立就照第 1 步「丟 commit」的做法用標題 `test: remove low-value main-process suites and browser probes (#33889)` 在 `vOLD..OLD_DEVELOP` 找到它丟掉。ad2156c358 那個 patch 跟上游相同，應該自動略過；沒略過（標題 `test: remove 140 low-value cases and 49 suites (#34062)` 還出現在 range-diff 的 `=`／`!`）也一樣丟掉。
- 守它的測試：`check:test-file-runners`（上游 lint 步驟）
- 驗證（2026-10-27，上游 v1.4.242）：兩個 cherry-pick 後 `check:test-file-runners` 從紅轉綠；revert 任一個就紅。
- 驗證（2026-10-28，上游 54411a9a96d54c6a4aea51110fa61c93709eaa97）：reliability-gates.jsonc 與 terminal-spawn-restore.test.ts 採上游版後，`git diff HEAD` 這兩個檔為空；在 canary worktree 套上本次全部條目後 `pnpm tc` 通過（tc 在最後改 updater／conflict-review／ui-rounds-map 5 個測試檔之前跑，那幾處只動測試的假物件與斷言）、canary 那 197 個測試檔除了下面 07b5c083bd 那條的 `SourceControlAgentActionDialog.folder-cwd.test.tsx`（2 個案例）都過、上游 lint 34 步（`node config/scripts/fork-lint-run.mjs`）全過。

## fe820789099529f6b40b73c6ce10d036371b015c（#34222、fix(wsl): background file reads and watches never start a stopped WSL distro (E9)）、362104ca1855982c98fc1b55a20cacc0077eae82（#34231、同系列 Git／roots catalog）、bec82762918d11542d5e63d1a6281035b3b7d773（#34119、fix(editor): let desktop edit host files outside workspaces）× fork 3c377c2b27（feat(source-control): folder workspace 多 repo 變更面板、ClipCode 複製與還原,移植到 v1.4.229）、ba35906362（fix(source-control): folder 分頁的 git/讀檔改由 filePath 推導 repo 相對路徑，還原時丟掉失效 git owner 會重算 relativePath）、90edae3503（fix(editor): pass the conflict overview read a git owner only when the tab has one）— canary 2026-10-28
- 類型：兩邊各改各的
- 衝突檔：src/renderer/src/components/editor/useEditorPanelExternalContentEvents.ts（`EditorPanelContentLoadOptions`）、useEditorPanelActiveTabContentLoad.ts（conflict overview 的 `loadFileContent`）、useEditorPanelFileContentLoader.ts（`readWorktreeId`／`readRelativePath` 宣告）
- 連帶症狀：失敗測試 src/renderer/src/components/editor/folder-relative-git-consumers.test.tsx（衝突重設成上游造成，照下面合好就過）；src/renderer/src/components/editor/conflict-review-folder-owner.test.tsx、EditorConflictReviewSurface.git-owner.test.tsx（上游的 overview 讀取與 Retry 多帶 `{ wakeWslDistro: true }`，fork 測試的斷言寫死參數）
- 處理：上游加了 `wakeWslDistro` 選項（active 分頁的讀取與 Retry 可喚醒停止的 WSL distro），fork 在同一個 options 型別加 `gitWorktreeId`。① `EditorPanelContentLoadOptions` 兩個欄位都留（上游的 `wakeWslDistro` 在前，fork 的 `gitWorktreeId` 與註解在後）。② ActiveTabContentLoad：view 分支採上游（帶 `load`）；沒有 view 時 `activeFile.gitWorktreeId ? loadFileContent(…, entry.path, { ...load, gitWorktreeId: activeFile.gitWorktreeId }) : loadFileContent(…, entry.path, load)`。③ FileContentLoader：採上游四行（新增的 `readGrantId`、`readGrantPairing`），只把 `readWorktreeId` 換成 fork 的 `options?.gitWorktreeId ?? (restoredOpenFile ? getOpenFileGitWorktreeId(restoredOpenFile) : worktreeId)`、`readRelativePath` 換成 fork 的 `restoredOpenFile ? getOpenFileGitRelativePath(useAppStore.getState(), restoredOpenFile) : relativePath`。④ 兩個 fork 測試：conflict-review-folder-owner.test.tsx 第 5 個參數改 `expect.objectContaining({ gitWorktreeId: 'repo-a' })`；EditorConflictReviewSurface.git-owner.test.tsx 的 `reloadContent` 斷言加第二個參數 `expect.anything()`（fork 3538de7a06 的測試）。合好的檔在 `~/.cache/orca-fork-canary/20261027T213118Z-21638/resolution/files/`。
- 守它的測試：fork-seam-tests「gitWorktreeId on editor open actions」組（EditorConflictReviewSurface.git-owner.test.tsx）、conflict-review-folder-owner.test.tsx、folder-relative-git-consumers.test.tsx
- 驗證（2026-10-28，上游 54411a9a96d54c6a4aea51110fa61c93709eaa97）：三個 editor 測試檔 11 個測試全過；在 canary worktree 套上本次全部條目後 `pnpm tc` 通過（tc 在最後改 updater／conflict-review／ui-rounds-map 5 個測試檔之前跑，那幾處只動測試的假物件與斷言）、canary 那 197 個測試檔除了下面 07b5c083bd 那條的 `SourceControlAgentActionDialog.folder-cwd.test.tsx`（2 個案例）都過、上游 lint 34 步（`node config/scripts/fork-lint-run.mjs`）全過。

## 07b5c083bd995457a503353cb059685622719759（#31310、AI fix actions use the + menu's agent picker and remember chat or terminal）× fork b110bc0711（fix(source-control): judge chat eligibility with the folder repo launch's start directory）、1ab0819078（fix(source-control): judge Explain commit and CLI-argument visibility at the folder repo launch）、6c713951cd（refactor: carry fork values in options objects instead of trailing positional params）、3c377c2b27（feat(source-control): folder workspace 多 repo 變更面板…）— canary 2026-10-28
- 類型：上游改了 fork 依賴的 API
- 衝突檔：src/renderer/src/components/right-sidebar/source-control/ai/recovery-launch.ts、src/renderer/src/components/right-sidebar/useSourceControlAgentActionDialog.ts（2 個 hunk）、src/renderer/src/components/right-sidebar/useSourceControlAgentActionStart.ts
- 連帶症狀：typecheck 錯誤 src/renderer/src/components/right-sidebar/source-control/ai/recovery-launch.folder-cwd.test.ts、src/renderer/src/components/right-sidebar/source-control/ai/use-recovery-ai.ts（TS2353 `editorWorktreeId`，衝突重設造成）；失敗測試 recovery-launch.folder-cwd.test.ts（合好就過）、src/renderer/src/components/right-sidebar/SourceControlAgentActionDialog.folder-cwd.test.tsx（要重寫，見下）
- 處理：上游把對話框的 agent 判斷換成 `useSourceControlActionAgentChoice`（讀「+」選單的 `useAgentMenuObservation`），不再用 fork 擴充過的 `useSourceControlLaunchableAgents`／`sourceControlLaunchAppliesAgentArgs`；對話框也不再自動啟動，已存設定的直接啟動改走新檔 `use-saved-source-control-action-start.ts`（use-ai.ts 的解衝突、checks panel 用）。fork 的語意（folder workspace 裡 repo 的 agent 開在 folder workspace、起始目錄在 repo，chat 資格在那個目錄判斷）照下面接回：
  - recovery-launch.ts：fork 的 `launchWorktreeId`／`initialCwd`／`launchWorkspace` 自動合入；衝突 hunk 寫成 `worktreeId: launchWorktreeId, groupId: activeGroupId ?? launchWorktreeId, initialCwd, prompt: commandInput, ...projection`。
  - useSourceControlAgentActionStart.ts：deps 陣列只加 `initialCwd`（上游已拿掉 `isRemote`）。
  - useSourceControlAgentActionDialog.ts：第 1 個 hunk 採上游；第 2 個 hunk 採上游、在 `groupId,` 後加 `initialCwd,`；`useSourceControlActionAgentChoice({ …, settings, initialCwd })`。
  - use-source-control-action-agent-choice.ts（上游檔，沒衝突）：參數加 `initialCwd?: string | null`（註解 `// A folder repo's launch directory; chat rows are judged there, not at the folder root.`）；`rows` 在有 `worktreeId` 且有 `initialCwd` 時 target 改成 `{ workspace: { worktreeId, kind: workspaceKindForWorktreeId(worktreeId) }, launchCwd: initialCwd }`（上游 `AgentMenuRowsTarget.launchCwd` 本來就讓 chat 列在該目錄判斷），deps 加 `args.initialCwd`。
  - use-ai.ts（上游檔，沒衝突，但上游新流程會繞過 fork 的路由）：解衝突的 `editor` 物件改 `worktreeId: editorWorktreeId ?? activeWorktreeId`，加 `initialCwd: editorWorktreeId && editorWorktreeId !== activeWorktreeId ? worktreePath : undefined`（這個物件也會被 `{...resolveConflictsEditor}` 展開進對話框，蓋掉 panel-dialogs 傳的 worktreeId／initialCwd）。
  - use-saved-source-control-action-start.ts（上游新檔）：`sourceControlLaunchAppliesAgentArgs({ …, repoId: args.repoId, initialCwd: args.initialCwd })`。
  - SourceControlAgentActionDialog.folder-cwd.test.tsx 要依新結構重寫：它 mock 的 `sourceControlLaunchAppliesAgentArgs`／`agentsOfferedForLaunch` 對話框已經不用。「auto-starts a saved chat-only agent at the folder root」：上游對話框不再自動啟動，改測 `useSavedSourceControlActionStart`（folder 根目錄 → chat 路由、不帶 CLI 參數）；「refuses a saved chat-only agent for a repo below the folder root」：照上游 useSourceControlAgentActionDialog.test.tsx 的 renderHook 寫法（store 的 detected agents、`setLocalRuntimeCapabilitiesForTests`），`worktreeId` 給 folder key、`initialCwd: '/work/repo-1'`，斷言 codex 的 chat 列不可用、`canStart` 為 false 或 CLI 參數會套用。另外替 use-ai.ts 的 `editor` 補一個會咬的案例（拿掉 `initialCwd` 那行要紅）。
  - 合好的檔在 `~/.cache/orca-fork-canary/20261027T213118Z-21638/resolution/files/`。
- 守它的測試：fork-seam-tests「Agent launch cwd in folder repos」組（recovery-launch.folder-cwd.test.ts、SourceControlAgentActionDialog.folder-cwd.test.tsx）
- 驗證（2026-10-28，上游 54411a9a96d54c6a4aea51110fa61c93709eaa97）：`pnpm tc` 通過；recovery-launch.folder-cwd.test.ts 通過；SourceControlAgentActionDialog.folder-cwd.test.tsx 2 個案例仍紅（測試本身過時，未重寫）；use-ai.ts 與 use-saved-source-control-action-start.ts 的兩處接線只過了 tc，行為未驗證。

## 6c2423d25df49dcda0d7768a4d6aa721d8d1eba5（#34017、fix(mobile): list Source Control changes with desktop's sections, order and row rules）× fork bcd68debfe（fix(source-control): 修正 folder workspace 多 repo 與 ClipCode 交叉測試找到的問題）、8af97f9687（refactor(clipcode): move Copy Full Source out of upstream components into fork slots）、eb37c124f4（test: move fork cases out of upstream test files into .fork.test siblings）、215cebc66c（test: pin the settled diff cache key and the folder repo combined-view opens）— canary 2026-10-28
- 類型：上游改了 fork 依賴的 API
- 衝突檔：src/renderer/src/components/right-sidebar/source-control/commit/use-discard-confirmation.ts（import 那一行）
- 連帶症狀：typecheck 錯誤 src/renderer/src/components/right-sidebar/source-control/clipcode/clipcode-menu-items.tsx、src/renderer/src/components/right-sidebar/source-control/listing/section-action-buttons.fork.test.tsx、src/renderer/src/components/right-sidebar/source-control/panel/panel-content.fork.test.tsx（TS2307 找不到 section-order）
- 處理：上游把 `source-control/listing/section-order.ts` 搬到 `src/shared/source-control-section-order.ts`（export 名稱不變，型別多了泛型參數、有預設值）。use-discard-confirmation.ts 採上游的 import，下一行留 fork 的 `import { useSourceControlWorktreeScope } from '../folder/worktree-scope'`；三個 fork 檔的 import 改成 `'../../../../../../shared/source-control-section-order'`（跟上游同目錄深度的寫法一致）。
- 守它的測試：section-action-buttons.fork.test.tsx、panel-content.fork.test.tsx（「Upstream component slots and folder routing」組）
- 驗證（2026-10-28，上游 54411a9a96d54c6a4aea51110fa61c93709eaa97）：在 canary worktree 套上本次全部條目後 `pnpm tc` 通過（tc 在最後改 updater／conflict-review／ui-rounds-map 5 個測試檔之前跑，那幾處只動測試的假物件與斷言）、canary 那 197 個測試檔除了下面 07b5c083bd 那條的 `SourceControlAgentActionDialog.folder-cwd.test.tsx`（2 個案例）都過、上游 lint 34 步（`node config/scripts/fork-lint-run.mjs`）全過。

## 16a29bc2fe7b82324d9d6eb6b45b862369589611（#34440、refactor(pty): group IPC test harness and provider fixtures）× fork eb37c124f4（test: move fork cases out of upstream test files into .fork.test siblings）— canary 2026-10-28
- 類型：上游改了 fork 依賴的 API
- 衝突檔：無
- 連帶症狀：typecheck 錯誤與失敗測試 src/main/ipc/pty-agent-pane-launch.fork.test.ts（TS2307 `./pty-ipc-mock-registry`、`./pty-ipc-test-harness`、`./pty-launch-race-test-fixture`）
- 處理：上游把 pty IPC 測試 harness 與上游的 `pty-agent-pane-launch.test.ts` 都搬進 `src/main/ipc/pty/`。fork 測試跟著搬到 `src/main/ipc/pty/pty-agent-pane-launch.fork.test.ts`（`git mv`），相對路徑：`./pty/provider/…`→`./provider/…`、`./pty/register-handlers`→`./register-handlers`、`../../shared/`→`../../../shared/`、其他 `'../X'`（import 與 vi.mock）→`'../../X'`；`config/fork-seam-tests.txt` 第 113 行改成新路徑。也順便解掉 run 141 審查留下的「fork 測試留在 src/main/ipc/、上游 sibling 已搬到 pty/」。
- 守它的測試：fork-seam-tests「Agent launch cwd in folder repos」組（這個檔）
- 驗證（2026-10-28，上游 54411a9a96d54c6a4aea51110fa61c93709eaa97）：搬過去後這個檔的測試全過；在 canary worktree 套上本次全部條目後 `pnpm tc` 通過（tc 在最後改 updater／conflict-review／ui-rounds-map 5 個測試檔之前跑，那幾處只動測試的假物件與斷言）、canary 那 197 個測試檔除了下面 07b5c083bd 那條的 `SourceControlAgentActionDialog.folder-cwd.test.tsx`（2 個案例）都過、上游 lint 34 步（`node config/scripts/fork-lint-run.mjs`）全過。

## a2b378018a013ad0f869ebfc28e9cac68a5b3c32（#34254、Withhold virtual review tabs from mobile sessions）× fork 6d64103c0e（refactor(git-graph-tab): route upstream editor-kind sites through fork-editor-tab-kinds）、491ef253b4（test(git-graph-tab): pin lazy retry and old-client exclusion; rename editor-kind modules）— canary 2026-10-28
- 類型：上游修了同一件事
- 衝突檔：無
- 連帶症狀：typecheck 錯誤 src/renderer/src/runtime/sync-runtime-graph/mobile-session-surfaces.ts（TS2367，第 91 行 `file.mode === 'git-graph'` 跟 `'diff' | 'edit' | 'markdown-preview'` 不重疊）；失敗測試 src/shared/fork-editor-kind-sites.guard.test.ts（`every allowlist entry still names check-details and still lacks git-graph`）
- 處理：上游在 `isMobilePublishableOpenFile` 改成只放行 edit／diff／markdown-preview，git-graph 已經被排除，所以刪掉 fork 加的 `file.mode === 'git-graph' ||` 那行（這個檔回到與上游相同）。上游同時把 `old-client-session-editor-rows.ts` 的 `reviewTabRow` 拿掉（check-details 改由 old-client-session-tabs-projection.ts 的 switch 處理，那裡已有 `case 'git-graph'`），所以 guard 測試的 `ALLOWED` 刪掉 `shared/workspace-layout/old-client/old-client-session-editor-rows.ts` 那一筆。
- 守它的測試：fork-seam-tests「git-graph tab type」組（fork-editor-kind-sites.guard.test.ts）
- 驗證（2026-10-28，上游 54411a9a96d54c6a4aea51110fa61c93709eaa97）：guard 測試通過、`git diff HEAD -- mobile-session-surfaces.ts` 為空；在 canary worktree 套上本次全部條目後 `pnpm tc` 通過（tc 在最後改 updater／conflict-review／ui-rounds-map 5 個測試檔之前跑，那幾處只動測試的假物件與斷言）、canary 那 197 個測試檔除了下面 07b5c083bd 那條的 `SourceControlAgentActionDialog.folder-cwd.test.tsx`（2 個案例）都過、上游 lint 34 步（`node config/scripts/fork-lint-run.mjs`）全過。

## 875d89af50f7c5aa84bc75b3910d713124f1c3ef（#34147、Refine lint performance and safe process execution）× fork 06a8dac7ae（ci(fork): run fork-check-lint's upstream steps from package.json）、2884c0778d（ci(fork): run fork-check-lint's upstream steps from run-lint.mjs LINT_STEPS）— canary 2026-10-28
- 類型：上游改了 fork 依賴的 API
- 衝突檔：無
- 連帶症狀：失敗測試 config/scripts/fork-lint-run.test.mjs（`applies this checkout's exclusions to upstream's lint steps`）；報告的「Lint failures」只有 `SyntaxError: The requested module './run-lint.mjs' does not provide an export named 'resolveLintCommands'`，代表 canary 在合併樹上一步上游 lint 都沒跑（本條驗證行是另外跑的結果）。
- 處理：上游 run-lint.mjs 不再 export `resolveLintCommands`、拿掉 `BARE_COMMANDS`（`check:import-boundaries`、`lint:ast-grep-gates` 都有 package script 了，只剩 `oxlint` 沒有），改用 `@orca/process-host` 的 `runProcess`。fork-lint-run.mjs：只 import `LINT_STEPS`；刪掉 `pnpmArgs`；`lintStepArgs(name, scripts)` 改成有 package script → `['run', name]`、`oxlint` → `['exec', 'oxlint']`、其他丟錯 `` fork-lint-run: upstream lint step `<name>` has no package script; see run-lint.mjs ``；入口 `applyExclusions(LINT_STEPS).map((name) => ({ name, args: lintStepArgs(name, scripts) }))`。測試跟著改（`lintStepArgs` 案例改吃名稱並測丟錯；最後一個案例不再用 `resolveLintCommands`）。`config/fork-upstream-api.txt` 刪掉 `config/scripts/run-lint.mjs resolveLintCommands`，上一行註解改成「…so it reads the step list run-lint.mjs uses.」。auto-rebase SKILL.md 第 1 步第 8 點的 `resolveLintCommands` 與 `pnpmArgs` 兩處描述也要跟著改。完整內容在 `~/.cache/orca-fork-canary/20261027T213118Z-21638/resolution/files/config/`。
- 守它的測試：config/scripts/fork-lint-run.test.mjs；`make fork-check-lint`
- 驗證（2026-10-28，上游 54411a9a96d54c6a4aea51110fa61c93709eaa97）：fork-lint-run.test.mjs 5 個測試通過；在 canary worktree 實際跑 `node config/scripts/fork-lint-run.mjs`，34 步（35 扣 EXCLUDED 1）全跑：套其他條目前只有 `oxlint` 紅（下面 bec8276291 那條），套完後 34 步全過。`make fork-check-lint` 其餘 fork 檢查（fork-pr-gate-needs、fork-locale-parity、fork-test-inventory、fork-upstream-api、precheck.test.sh、check:daemon-protocol-crossing）在 canary worktree 也全過；canary 對上游 main 試合時 parity 與 inventory 的基底要用 `HEAD`：用 v1.4.242 會把上游 main 新加的 6 個測試（mobile/src/theme/themed-styles.test.ts 等）誤報成「fork-added test that no runner collects」。

## bec82762918d11542d5e63d1a6281035b3b7d773（#34119、fix(editor): let desktop edit host files outside workspaces）× fork 0329d9e448（fix(source-control): refresh a folder repo after a save whose views all closed）— canary 2026-10-28
- 類型：兩邊各改各的
- 衝突檔：無
- 連帶症狀：上游 lint 的 `oxlint` 步驟紅：src/renderer/src/components/editor/editor-save-queue.ts `eslint(max-lines)` 301 行（上限 300，不計空行與註解）；上游加到剛好 300，fork 的 `filePath: liveFile.filePath,` 多 1 行。
- 處理：照 FORK.md「max-lines」那條把 fork 碰到的那段搬出去：新檔 `src/renderer/src/components/editor/editor-file-saved-dispatch.ts`（檔頭註解 `// Moved from editor-save-queue.ts when the fork's filePath pushed it past max-lines; port upstream edits to this dispatch here.`）export `dispatchEditorFileSaved(state, { fileId, content, filePath, savedViewId })`，裡面是原本的 `window.dispatchEvent(new CustomEvent<EditorFileSavedDetail>(ORCA_EDITOR_FILE_SAVED_EVENT, …))`，`recordViewIds` 照原樣（有 `savedViewId` 時 `editorBufferSiblingViewIds(state, savedViewId)`，否則 `[fileId]`）。editor-save-queue.ts 改呼叫 `dispatchEditorFileSaved(store.getState(), { fileId, content: contentToSave, filePath: liveFile.filePath, savedViewId: savedView?.id })`，從 `./editor-autosave` 的 import 拿掉 `ORCA_EDITOR_FILE_SAVED_EVENT` 與 `EditorFileSavedDetail`。之後上游改這段 dispatch 時要搬到新檔。兩個檔在 `~/.cache/orca-fork-canary/20261027T213118Z-21638/resolution/files/src/renderer/src/components/editor/`。
- 守它的測試：fork-seam-tests「Editor save event」組（editor-file-saved-event.contract.test.ts）、use-folder-repo-status-refresh.store.test.ts；上游 lint 的 `oxlint`
- 驗證（2026-10-28，上游 54411a9a96d54c6a4aea51110fa61c93709eaa97）：`pnpm exec oxlint` 對兩個檔無錯；上游 lint 34 步全過；在 canary worktree 套上本次全部條目後 `pnpm tc` 通過（tc 在最後改 updater／conflict-review／ui-rounds-map 5 個測試檔之前跑，那幾處只動測試的假物件與斷言）、canary 那 197 個測試檔除了下面 07b5c083bd 那條的 `SourceControlAgentActionDialog.folder-cwd.test.tsx`（2 個案例）都過、上游 lint 34 步（`node config/scripts/fork-lint-run.mjs`）全過。

## 217f93559766fc725b59651c9dfa69100fa21ecc（#11567、fix(updater): skip IPC when the main window is destroyed）× fork 60845d5733（refactor(fork): stop exporting upstream internals the fork reads）、2ad9ca08a2（test(fork): pin fork seams the v1.4.238 rebase review found untested）— canary 2026-10-28
- 類型：上游改了 fork 依賴的 API
- 衝突檔：無
- 連帶症狀：失敗測試 src/main/updater/updater-nudge.fork.test.ts（2 個案例 `TypeError: win.isDestroyed is not a function`）、src/main/updater.fork-distribution.test.ts（`answers background and menu checks with not-available instead of checking`：送不出 `updater:status`）
- 處理：上游 `sendToMainWindow` 先檢查 `win.isDestroyed()` 與 `win.webContents.isDestroyed()`。兩個 fork 測試的假視窗補上：`const live = () => false`，視窗改成 `{ isDestroyed: live, webContents: { send, isDestroyed: live } }`，SAFETY 註解改成「the updater only checks isDestroyed and calls webContents.send on its window.」。只改 fork 測試檔。
- 守它的測試：fork-seam-tests「Updater: fork distribution」組
- 驗證（2026-10-28，上游 54411a9a96d54c6a4aea51110fa61c93709eaa97）：兩個檔 7 個測試全過；在 canary worktree 套上本次全部條目後 `pnpm tc` 通過（tc 在最後改 updater／conflict-review／ui-rounds-map 5 個測試檔之前跑，那幾處只動測試的假物件與斷言）、canary 那 197 個測試檔除了下面 07b5c083bd 那條的 `SourceControlAgentActionDialog.folder-cwd.test.tsx`（2 個案例）都過、上游 lint 34 步（`node config/scripts/fork-lint-run.mjs`）全過。

## f719d0fb10613a2fc124f97a16323daa47c88d62（#33964、fix(mobile): open terminal urls and file paths with desktop's link detection）× fork e1dcba929d（test(ui-rounds): serialize round lifecycle and keep fixed label words in the guard）— canary 2026-10-28
- 類型：上游改了 fork 依賴的 API
- 衝突檔：無
- 連帶症狀：失敗測試 config/scripts/ui-rounds-map.test.mjs（`name only UI text that the renderer still has`：`tests/ui-rounds/cases/sc-errors-history.mjs: "README"`）
- 處理：`README` 是 fixture 的檔名（`/^sortable README/` 找的是分頁），之前只是剛好出現在上游 `terminal-bare-file-link-detection.ts` 的字串裡，上游把那份清單搬走後 guard 找不到。在 ui-rounds-map.test.mjs 的 `FIXTURE_NAMES` 尾端加 `'README'`，不改 round 腳本。
- 守它的測試：config/scripts/ui-rounds-map.test.mjs
- 驗證（2026-10-28，上游 54411a9a96d54c6a4aea51110fa61c93709eaa97）：ui-rounds-map.test.mjs 2 個測試通過；在 canary worktree 套上本次全部條目後 `pnpm tc` 通過（tc 在最後改 updater／conflict-review／ui-rounds-map 5 個測試檔之前跑，那幾處只動測試的假物件與斷言）、canary 那 197 個測試檔除了下面 07b5c083bd 那條的 `SourceControlAgentActionDialog.folder-cwd.test.tsx`（2 個案例）都過、上游 lint 34 步（`node config/scripts/fork-lint-run.mjs`）全過。

## d1f3532bb1c518564c67a031cfbdacca73a92b94（#34322、docs: restore AGENTS.md reference docs under docs/agents-md-refs）、cf7379610fc9cbb567731ba6035c54bcda17bb30（#34507、Change wording from 'low value' to 'negative value'）× fork cfdeffbfb7（docs(fork): read FORK.md before branching, pushing or opening a PR）、d821009f38（docs(fork): restore the CLAUDE.md import; red lines and overrides in versioned files）、a841fba867（docs(fork): diagnose after the third review round; pin long checks）、35bcf04136（docs(fork): 記錄 fork 的合併閘門、非 UI 測試策略與環境陷阱;fork-check 擋落後基準）— canary 2026-10-28
- 類型：兩邊各改各的（同 resolution-history 裡 512927523e 那條，重寫）
- 衝突檔：AGENTS.md（1 個 hunk，檔尾 `# Tests` 那行）
- 連帶症狀：無
- 處理：上游把參考文件放回 `docs/agents-md-refs/`、改了 `# Tests` 那行的措辭並加回 `[Anti-patterns](./docs/agents-md-refs/test-antipatterns.md)` 連結。採上游 AGENTS.md 全文，檔尾空一行後補回 fork 的 `# Fork Maintenance` 整段（跟 develop 上的一字不改）。
- 守它的測試：逐位元組證明（AGENTS.md 在 `vOLD..舊 develop` 與 `vNEW..新 head` 的 fork 新增行相同、沒刪上游行）；`check:readme-local-links` 不掃 AGENTS.md，不能當證明。
- 驗證（2026-10-28，上游 54411a9a96d54c6a4aea51110fa61c93709eaa97）：`git diff HEAD -- AGENTS.md` 只有檔尾 fork 那段新增；在 canary worktree 套上本次全部條目後 `pnpm tc` 通過（tc 在最後改 updater／conflict-review／ui-rounds-map 5 個測試檔之前跑，那幾處只動測試的假物件與斷言）、canary 那 197 個測試檔除了下面 07b5c083bd 那條的 `SourceControlAgentActionDialog.folder-cwd.test.tsx`（2 個案例）都過、上游 lint 34 步（`node config/scripts/fork-lint-run.mjs`）全過。

## fork 自身問題（待人判斷，auto-rebase 不要照做：folder 層級的外部變更要不要配對到 repo-scoped diff 分頁：兩條路徑不一致）× fork 3c377c2b27（folder workspace 多 repo）、ba35906362（folder diff 改用 filePath 比對）— auto-rebase 2026-10-27
- 類型：待人判斷
- 衝突檔：無
- 連帶症狀：無（審查者 C 的 mutation：拿掉 `editor-autosave.ts:177` 的 `getOpenFileGitWorktreeId(file) === target.worktreeId`，所有測試仍綠）
- 處理：`getOpenFilesForExternalFileChange` 的 fallback 路徑（沒有 `indexedOpenFiles` 時）用第 177 行排除「target 是 folder 本身、分頁是 repo-scoped diff」的情境；`editor-external-watch-path-index.ts` 的 index 路徑在同一情境以 `filePath` 配對、會包含它。第 177 行原本是為了 relativePath 撞名（ba35906362 之前用 relativePath 比對），現在 scoped 分頁已改用 filePath 比對，這個目的已由第 174 行達成。要使用者決定：刪掉第 177 行（跟 index 路徑一致），或讓 index 路徑也排除；決定後在 `editor-autosave.fork.test.ts` 補一個會咬的測試。不要在 auto-rebase 裡自己選一邊。
- 守它的測試：待補（editor-autosave.fork.test.ts）
- 驗證：未驗證（只有讀程式碼與 C 的 mutation 結果）
