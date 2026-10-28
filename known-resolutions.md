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

## f4d98b74e32535fb12394a085a0dd01bd9975a97、791502fae43c9886bdec4b6cf78a1bb91678c06f、2cd3e6d6a38347fd15db9f5dd3d61b1b715ba978、beb53a7f9e8816269702cf065a747bb3b08ef56e、e0f32dcac1d0669952bd5ec7c43fc94c9c0158df、1df26abf60f9da03f850d76150e251a304be6f04、8b64ec281a318d1bd1d041a4525cd5986dca2370（上游 main 的 7 個 CI commit）× fork 4e3b0c1fbd、f87f545202、5791e58c0c、d5d565db6a、e6469b6a48、8b5087529e、bca26276e6（這 7 個 commit 自己的 cherry-pick）— auto-rebase 2026-10-28
- 類型：上游修了同一件事
- 衝突檔：可能有 `.github/` 與這些 commit 碰的 config/scripts 測試檔
- 連帶症狀：無
- 處理：v1.4.243 的 eb94767705（ci: sync release workflows with main for the v1.4.243 cut）把 `.github/` 同步到上游 main 8b64ec281a，讀 workflow 的 12 個上游測試卻沒同步，乾淨的 v1.4.243 一樣紅。auto-rebase v1.4.243 用 `cherry-pick -x --no-commit` 帶進這 7 個 commit，`.github/` 一律留 v1.4.243 那側，只帶測試、腳本、`config/vitest.config.ts`、`config/tsconfig.node.json`、docs（訊息有 `(cherry picked from commit …)`）。因為少了 `.github/` 的 hunk，patch-id 跟上游不同，rebase 到含它們的 release 時**不會自動略過**。適用條件 `git merge-base --is-ancestor 8b64ec281a318d1bd1d041a4525cd5986dca2370 vNEW`：成立就照第 1 步「丟 commit」的做法，用下面的標題在 `vOLD..OLD_DEVELOP` 各找到一個丟掉（7 個都要丟；只有部分是 vNEW 祖先時，只丟是祖先的那幾個）：
  - `ci: run hourly and daily dev builds on free hosted runners (#34585)`
  - `ci: move secondary, scheduled and contract workflows to GitHub-hosted runners (#34568)`
  - `ci: narrow churny cache keys and move PR-local cache saves to main (#34600)`
  - `ci: keep hourly and daily macOS builds on Blacksmith (#34640)`
  - `ci: seed hosted Linux packaging and mobile bundle caches on main, and stop PR-local saves (#34672)`
  - `ci(adhoc): package Mac architectures on 6-vCPU runners (#34673)`
  - `ci: restore main's Vitest transform cache in PR unit shards (#34512)`
  丟完後 `config/scripts/orcad-windows-prebuild-cache.mjs` 會回到上游版（cherry-pick 版少了 v1.4.243 沒有的 `wsl-distro-allowlist.ts` 那行）。
- 守它的測試：fork CI 的整套單元測試（ci-native-cache、ci-dependency-download-cache、ci-unit-module-cache、mobile-{typecheck-cache,test-change-scope,release-check-scope}、ssh-windows-mobile-bundle、mac-notarization-builder-contract、hourly-preflight-workflow、dev-channel-orcad-template-workflow）
- 驗證（2026-10-28，上游 v1.4.243）：cherry-pick 前 CI run 40632346756 與乾淨 v1.4.243 都是 12 個紅；之後 13 檔 303 測試綠，CI run 40638472279 全綠。

## fork 自身問題（folder 分頁讀檔的 `options?.gitWorktreeId` 沒有測試守）× fork 1f0c6b9b5a（folder workspace 多 repo）— auto-rebase 2026-10-28
- 類型：fork 自身問題
- 衝突檔：無
- 連帶症狀：無（審查者 C2 的 mutation：拿掉 `useEditorPanelFileContentLoader.ts` `readWorktreeId` 的 `options?.gitWorktreeId ??`，seam 測試與 editor、store 目錄全綠）
- 處理：在 `src/renderer/src/components/editor/folder-relative-git-consumers.test.tsx` 補一例：`loadFileContent` 帶 `{ gitWorktreeId: 'repo-a' }`、沒有對應的 open file（`restoredOpenFile` 為空）時，讀檔走 repo-a 的 runtime target，不是 folder。只改 fork 測試檔，拿掉那個 `??` 要紅。這個 hunk 在 v1.4.243 rebase 時衝突過（上游在旁邊加了 `readGrantId` 兩行），fork 行沒變，所以這次算既有缺口。
- 守它的測試：folder-relative-git-consumers.test.tsx（fork-seam-tests「Upstream component slots and folder routing」組）
- 驗證：未驗證（只有 C2 的 mutation 結果）

## fork 自身問題（recovery launch 的 `worktreeId: launchWorktreeId` 沒有測試守）× fork 1f0c6b9b5a、defb41e349（folder repo launch cwd）— auto-rebase 2026-10-28
- 類型：fork 自身問題
- 衝突檔：無
- 連帶症狀：無（審查者 C2 的 mutation：`recovery-launch.ts` 的 `worktreeId: launchWorktreeId` 改回 `activeWorktreeId`，1075 檔全綠：`recovery-launch.folder-cwd.test.ts` 第一例兩個值相同，第二例在啟動前就被拒）
- 處理：在 `recovery-launch.folder-cwd.test.ts` 補一例：`acquireAgentLaunchChoices` 的 mock 改成可變（`detected: ['codex']`），`editorWorktreeId: FOLDER` 時斷言 `launchAgentInNewTab` 收到 `worktreeId: FOLDER, initialCwd: '/work/repo-1'`。只改 fork 測試檔，改回 `activeWorktreeId` 要紅。
- 守它的測試：recovery-launch.folder-cwd.test.ts（fork-seam-tests「Agent launch cwd in folder repos」組）
- 驗證：未驗證（只有 C2 的 mutation 結果）

## fork 自身問題（待人判斷，auto-rebase 不要照做：folder 層級的外部變更要不要配對到 repo-scoped diff 分頁：兩條路徑不一致）× fork 1f0c6b9b5a（folder workspace 多 repo）、8da7b7c407（folder diff 改用 filePath 比對）— auto-rebase 2026-10-27
- 類型：待人判斷
- 衝突檔：無
- 連帶症狀：無（審查者 C 的 mutation：拿掉 `editor-autosave.ts:177` 的 `getOpenFileGitWorktreeId(file) === target.worktreeId`，所有測試仍綠）
- 處理：`getOpenFilesForExternalFileChange` 的 fallback 路徑（沒有 `indexedOpenFiles` 時）用第 177 行排除「target 是 folder 本身、分頁是 repo-scoped diff」的情境；`editor-external-watch-path-index.ts` 的 index 路徑在同一情境以 `filePath` 配對、會包含它。第 177 行原本是為了 relativePath 撞名（8da7b7c407 之前用 relativePath 比對），現在 scoped 分頁已改用 filePath 比對，這個目的已由第 174 行達成。要使用者決定：刪掉第 177 行（跟 index 路徑一致），或讓 index 路徑也排除；決定後在 `editor-autosave.fork.test.ts` 補一個會咬的測試。不要在 auto-rebase 裡自己選一邊。
- 守它的測試：待補（editor-autosave.fork.test.ts）
- 驗證：未驗證（只有讀程式碼與 C 的 mutation 結果）

## d6918c7a1d3603d64b4c99b81631d2d64f2fd612（#34882、fix(remote-files): cap search replies, say when a diff is too large…）、f231d1cde623d1ad2c85bd066af0f65078131070（#35038、feat(files): play remote audio and video through one byte-range preview path）× fork d4e7998889（refactor: finish moving fork params into options objects and pin the remaining hops）、b9febe5124（refactor: carry fork values in options objects instead of trailing positional params）、244d910791（fix(source-control): 修正 folder workspace 多 repo 與 ClipCode 交叉測試找到的問題）、1f0c6b9b5a（feat(source-control): folder workspace 多 repo 變更面板、ClipCode 複製與還原,移植到 v1.4.229）、f7cf651666（fix(clipcode): commit diff 成功時一律回傳 missingSides: [],空檔只改權限不再被當成讀取失敗）、7b55a30d74（test(fork): 補上游接縫的非 UI 契約測試,修正 commit 複製把缺檔當空內容）、584d40868a（fix(source-control): 依第二輪 QA 修正:combined diff 在 dev StrictMode 不再 crash…）— canary 2026-10-29
- 類型：上游改了 fork 依賴的 API（上游在 `buildDiffResult` 第 6 個位置參數加 `tooLarge`，正好是 fork `readOptions` 的位置）
- 衝突檔：src/main/git/source-control/diff-result.ts（2 個 hunk）、file-diff.ts（2 個）、submodule-diff.ts、commit-diff.ts、src/shared/git-diff-compare-types.ts、src/renderer/src/components/editor/DiffSectionBody.tsx（2 個）
- 連帶症狀：typecheck 錯誤 src/main/git/source-control/commit-diff-missing-sides.real-git.test.ts、file-diff.read-failure.test.ts、file-diff.skip-render-limit-real-git.test.ts、src/main/ipc/filesystem/filesystem-git-status-handlers.ts、src/renderer/src/components/right-sidebar/source-control/clipcode/clipcode-commit-copy.ts、clipcode-commit-copy.test.ts、clipcode-entry-content.ts、clipcode-git-copy.ts（`missingSides`／`skipRenderLimit` 不存在，衝突重設造成）；失敗測試 src/main/git/source-control/blob-absence-real-git.fork.test.ts、commit-diff-missing-sides.real-git.test.ts、file-diff.read-failure.test.ts、file-diff.skip-render-limit-real-git.test.ts、src/renderer/src/components/editor/DiffSectionBody.monaco-strict-reveal.test.tsx（全部合好就過）
- 處理：上游讓超過 10 MiB 讀取上限的那側回 `tooLarge`（`git-blob-read.ts` 的 `TOO_LARGE_BLOB`），二進位結果多一個 `tooLarge` 欄位，diff 畫面顯示 `DiffTooLargeNotice`；#35038 把 `previewable-binary-mime-types.ts` 刪掉，改用 `shared/file-preview-kind` 的 `IMAGE_AND_PDF_PREVIEW_MIME_TYPES`／`filePreviewExtension`。
  - diff-result.ts：import 採上游（file-preview-kind 那 4 行），下面留 fork 的 `import type { GitDiffReadOptions } from './git-diff-read-options'`；參數寫成 `filePath?: string, /** 上游註解 */ tooLarge = false, readOptions: GitDiffReadOptions = {}`（上游的在前，fork 的接在後面）；其餘 fork 的 `readOptions.skipRenderLimit ? null : …`／`largeDiffRenderLimit?.limited` 自動合入。
  - file-diff.ts：宣告處 `let tooLarge = false` 與 fork 的 `let originalMissing = false`、`let modifiedMissing = false` 都留；呼叫寫 `filePath, tooLarge, options`。submodule-diff.ts 呼叫寫 `innerPath, tooLarge, options`。branch-diff.ts、commit-diff.ts 只傳 `tooLarge`（fork 本來就不傳 options），不動。
  - commit-diff.ts：衝突那行採上游 `Promise.resolve<GitBlobReadResult>({ content: '', isBinary: false, exists: false })`（上游也加了 `exists: false`）；fork 的 `const result = …`／`missingSides` 區塊自動合入。
  - git-diff-compare-types.ts：`GitDiffBinaryResult` 兩個欄位都留，上游的 `tooLarge?` 在前、fork 的 `missingSides?` 在後。
  - DiffSectionBody.tsx：import 寫 `import { DiffTooLargeNotice } from './DiffTooLargeNotice'` 加上 `import { Suspense, useEffect, useLayoutEffect, useRef } from 'react'`；渲染寫 `section.diffResult.tooLarge ? (<DiffTooLargeNotice />) : section.diffResult.isImage ? (` 後接 fork 的 `// Why: loading the image chunk…` 與 `<Suspense fallback={null}><ImageDiffViewer …/></Suspense>`。
  - 合好的檔在 `~/.cache/orca-fork-canary/20261028T213127Z-22584/resolution/files/`。
- 守它的測試：blob-absence-real-git.fork.test.ts、commit-diff-missing-sides.real-git.test.ts、file-diff.read-failure.test.ts、file-diff.skip-render-limit-real-git.test.ts（skipRenderLimit 與 missingSides）、DiffSectionBody.monaco-strict-reveal.test.tsx（Suspense），以及 `pnpm tc`
- 驗證（2026-10-29，上游 c66d873ff59720e82b24bf0eb309fabd80dedc0e）：在 canary worktree 套上本次全部條目後 `pnpm tc` 通過、canary 那 189 個測試檔 1303 個測試全過、上游 lint 35 步（`node config/scripts/fork-lint-run.mjs`）全過、`node config/scripts/fork-upstream-api.mjs HEAD` 通過。

## c1262516b90352484869031ec666b82044ccd376（#34932、perf(renderer): mirror modal overlays to body attributes instead of body:has()）× fork 2602bc9595（fix(source-control): keep toasts above the bulk action bar）— canary 2026-10-29
- 類型：兩邊各改各的
- 衝突檔：src/renderer/src/components/ui/sonner.tsx（import 區 1 個 hunk）
- 連帶症狀：失敗測試 src/renderer/src/components/ui/sonner.fork.test.tsx（衝突重設造成）
- 處理：兩邊都留：上游的 `import { MODAL_OVERLAY_CHILD_SELECTOR } from '@/lib/body-overlay-attributes'` 在前，接 fork 的 `import { TOAST_BOTTOM_CLEARANCE_VAR } …`、空行、`const TOAST_BOTTOM_OFFSET = …`；`offset`／`mobileOffset` 的 fork 改動自動合入。
- 守它的測試：sonner.fork.test.tsx
- 驗證（2026-10-29，上游 c66d873ff59720e82b24bf0eb309fabd80dedc0e）：同上一條（tc、189 檔、上游 lint 35 步全過）。

## 9015f1373548da2a4f602742b38aa36b7b79c510（#30637）、ef6e6614495b56f650579aeee391f6c5a16a50e3（#25695）、70a6f7d1846c9bf02a2f415083f07419064b12fb（#34584、test: remove 269 low-value cases and 26 suites）× fork 7b7fb6f5ff（chore(fork): list fork tests in upstream's new flaky-test pattern baseline）— canary 2026-10-29
- 類型：兩邊各改各的
- 衝突檔：config/flaky-test-pattern-baseline.txt（2 個 hunk）
- 連帶症狀：上游 lint 的 `lint:ast-grep-gates` 紅（衝突重設成上游後，fork 的 19 個測試檔「baseline allows 0」）
- 處理：採上游檔，只把 fork 新增的行（對 merge-base 多出來的 19 行）依它在 fork 版裡的前一行位置插回，不重排上游行。上游刪掉的行（例如 `test-no-real-time-wait:src/renderer/src/lib/monaco-delayer-cancellation-guard.test.ts`、native-chat 那幾行被上游搬位置）照上游，不要從 fork 側加回。合好的檔在快取（同上）。
- 守它的測試：上游 lint 的 `lint:ast-grep-gates`（flaky-test-pattern ratchet）
- 驗證（2026-10-29，上游 c66d873ff59720e82b24bf0eb309fabd80dedc0e）：`pnpm run lint:ast-grep-gates` 通過（`flaky-test-pattern ratchet OK — 3526 grandfathered`）；上游 lint 35 步全過。

## 1c58ed636ce4cea7ad69023c659e244ffb2e195f（#34610、fix(i18n): localize keyboard shortcut titles, groups, and filters）× fork 5e2c1af924（feat(source-control): Git Graph 改成編輯器分頁,可切換 repo,並加上快捷鍵與 Cmd+J 進入點）— canary 2026-10-29
- 類型：上游改了 fork 依賴的 API
- 衝突檔：無
- 連帶症狀：typecheck 錯誤 src/renderer/src/components/settings/keybinding-title-copy.ts（TS2741 `Property '"sourceControl.openGitGraph"' is missing in type … Record<StaticKeybindingActionId, () => string>`）
- 處理：上游新增的 `keybinding-title-copy.ts` 要求每個快捷鍵 id 都有本地化標題，fork 的 `sourceControl.openGitGraph` 沒有。在 `'sidebar.childWorkspaces.toggle'` 那筆後面加 `'sourceControl.openGitGraph': () => translate('keybindings.title.sourceControlOpenGitGraph', 'Open Git Graph'),`（兩行，同上下文格式）；每個 locale 檔 `keybindings.title` 裡 `"sidebarChildWorkspacesToggle"` 後面加 `"sourceControlOpenGitGraph"`：en `Open Git Graph`、es `Abrir Git Graph`、fr `Ouvrir Git Graph`、ja `Git Graph を開く`、ko `Git Graph 열기`、pt `Abrir Git Graph`、zh `打开 Git Graph`（沿用各語系 `GitGraphFullView.open` 的譯文）；de／ru／tr／zh-Hant 見下面「4 個新語系」那條。
- 守它的測試：`pnpm tc`（`satisfies Record<StaticKeybindingActionId, …>`）；`fork-locale-parity.mjs`
- 驗證（2026-10-29，上游 c66d873ff59720e82b24bf0eb309fabd80dedc0e）：`pnpm tc` 通過；`verify:localization-extraction`／`verify:localization-catalogs` 通過。

## 76d4b01969646712ec03caa7c274fd6426d31dc9（#22056、chore(i18n): gate unreferenced catalog keys in the extraction check and retire 1,644 of them）× fork 7dd67d3448（i18n(source-control): Git 介面優化新增字串補上五種語系翻譯）、65fabade4d（feat(source-control): Commits 區的分支篩選、git 端搜尋、載入更多與複製 commit 異動）、a58f16557e（feat(source-control): Git Graph 的資料夾右鍵、repo 色塊切換器、branch 依 Local/remote 分區）— canary 2026-10-29
- 類型：上游改了 fork 依賴的 API（上游新加的 gate 抓到 fork 的死 key）
- 衝突檔：src/renderer/src/i18n/en-runtime-required.json（上游退掉一大段 key，fork 在中間加了 `GitHistoryGraph` 區塊）
- 連帶症狀：上游 lint 的 `verify:localization-extraction`（`Catalog keys no source references`：`auto.components.right.sidebar.GitHistoryGraph.branches`、`.remote`）與 `verify:localization-catalogs`（`en-runtime-required.json no longer covers en.json`，同兩個 key）紅
- 處理：這兩個 key 是 65fabade4d 加的，a58f16557e 之後 develop 已沒有程式引用（`git grep "GitHistoryGraph.branches'\|GitHistoryGraph.remote'"` 為空），只是舊 gate 不抓。從每個 locale 檔（en、es、fr、ja、ko、pt、zh；vNEW 有新語系也一樣）的 `auto.components.right.sidebar.GitHistoryGraph` 刪掉 `"branches"` 與 `"remote"` 兩行；`en-runtime-required.json` 衝突採 vNEW 那側，不要跑 `pnpm sync:localization-runtime-catalog` 回寫（它只會把上游的 `launchPreparationFailed` 重排一行）。這兩個 key 刪掉在 develop 上現在就成立，也可以先在 develop 修掉。
- 守它的測試：上游 lint 的 `verify:localization-extraction`、`verify:localization-catalogs`
- 驗證（2026-10-29，上游 c66d873ff59720e82b24bf0eb309fabd80dedc0e）：刪掉後兩個步驟通過（`0 named nowhere in source`、`covers en.json: 677 of 16612`）；上游 lint 35 步全過。

## 8d908764dcd9c155e46bcbcab051804868ca2b30（#34662、Revert "Keep same-machine folders with matching Git remotes in separate projects (#32272)"）× 無 fork commit — canary 2026-10-29
- 類型：上游自己（release 分支與 main 各 revert 一次）；auto-rebase 不用處理
- 衝突檔：19 個 fork 欄空白的檔：src/main/ai-vault/cached-session-list.ts、src/main/ipc/register-core-handlers/register-core-handlers.ts、src/renderer/src/components/automations/{AutomationsPage.create-destination.test.tsx,automations-page-fixtures.ts,automations-page-runtime-fixtures.ts,automations-page-test-harness.tsx}、src/renderer/src/components/terminal-pane/{terminal-agent-session-fork.test.ts,terminal-drop-handler.test.ts}、src/renderer/src/lib/{agent-background-session-test-state.ts,ai-vault-resume-command.drop-repin.test.ts,ai-vault-resume-command.resumable-agent.test.ts,ai-vault-resume-command.test.ts,ai-vault-resume-shell.test.ts,ai-vault-session-fork-startup.test.ts,http-link-routing.test.ts,local-preflight-context-cache.test.ts,local-preflight-context.test.ts}、src/renderer/src/store/slices/{detected-agents.test.ts,worktrees-removal-state-cleanup.test.ts}
- 連帶症狀：無
- 處理：v1.4.243 的 262f88a980 是同一個 revert 在 release 分支上的版本，merge-base 5e49b6dd11 在兩者之前；main 之後又在這些檔加了改動（8e9a08b543、f231d1cde6、1eaaf85e9f、6a395dc4c4、3b4ae900d3、70a6f7d184 等）。fork 版這 19 個檔跟 v1.4.243 逐位元組相同（`git diff --quiet v1.4.243 fork/develop -- <檔>`），所以只是 canary 把整個 develop（含 v1.4.243）合進 main 才出現的衝突；canary 重設成上游 main 就是正解。auto-rebase 只重放 `vOLD..develop` 的 fork commit，不會碰這些檔，不用處理。之後 canary 看到 fork 欄空白、檔案在 262f88a980 裡的衝突，就歸這條。
- 守它的測試：無
- 驗證（2026-10-29，上游 c66d873ff59720e82b24bf0eb309fabd80dedc0e）：19 個檔 `git diff --quiet v1.4.243 MERGE_HEAD` 都成立、都在 `git show --stat 262f88a980` 裡；採上游後 tc、189 檔測試、上游 lint 35 步全過。

## b62f9bf6242441865b8cfdcd82322d1a75842a04（#29795、feat(i18n): add Traditional Chinese (zh-Hant) UI locale）、52a43ed99ef72aa2e8129a17c754dfffbd25a015（#34717、add Russian）、4b1967bdd83a47bef17293a4c4f9134d383cdb4a（#34718、add Turkish）、fe3eb45b857e70882605a6b910177b66d2eb62c4（#34917、add German）× fork 全部有 UI 字串的 commit（7dd67d3448 i18n(source-control): Git 介面優化新增字串補上五種語系翻譯 等）— canary 2026-10-29
- 類型：上游改了 fork 依賴的 API（上游新增 4 個語系檔，fork 的 key 都沒有）
- 衝突檔：無
- 連帶症狀：canary 報告看不到（它只跑上游 lint，上游的 `verify:localization-catalogs` 容忍未翻譯）；`make fork-check-lint` 的 `node config/scripts/fork-locale-parity.mjs <base>` 紅：`de.json`／`ru.json`／`tr.json`／`zh-Hant.json: missing 173 fork key(s), e.g. auto.components.right.sidebar.SourceControl.commitHashes…`
- 處理：FORK.md「每個 fork 字串進每個 locale」：vNEW 含其中任一個 commit，就把 fork 的 en key 翻進那個新語系（只有部分是 vNEW 祖先時只補那幾個語系）。canary 已翻好 173 個 key（含上面 1c58ed636c 那條的 `keybindings.title.sourceControlOpenGitGraph`）× 4 語系，扁平的 key→譯文表在 `~/.cache/orca-fork-canary/20261028T213127Z-22584/resolution/locale-translations/<語系>.json`，同目錄的 `insert_locale_keys.py <locales 目錄> <語系> <譯文表>` 依 en.json 的位置插進 locale 檔（格式與上游 `JSON.stringify(…, 2)` 相同、不動既有行）。auto-rebase 時：rebase 完在新 head 跑 `node config/scripts/fork-locale-parity.mjs vNEW`，對每個缺 key 的新語系跑一次插入腳本；之後還缺的（develop 在 canary 之後新增的 fork 字串）再翻。插進的只會是 fork 的 key，用額外 commit，訊息寫明是補上游新語系的 fork 譯文。FORK.md 第 35 行「seven since v1.4.238 added `pt.json`」改成實際語系數（全含是 11 個）。快取裡另有套在上游 main c66d873ff5 上的完整檔（`resolution/files/src/renderer/src/i18n/locales/`），vNEW 不同時不要直接複製，用譯文表。
- 守它的測試：`fork-locale-parity.mjs`（`make fork-check-lint`）
- 驗證（2026-10-29，上游 c66d873ff59720e82b24bf0eb309fabd80dedc0e）：插進 4 個語系後 `fork-locale-parity.mjs HEAD` 通過（`173 fork keys present in every locale`）、`verify:localization-extraction`／`verify:localization-catalogs`／`verify:localization-coverage` 通過；每個譯文的 `{{…}}` 佔位符與英文一致。譯文由子代理照各語系既有用語翻（zh-Hant 用 存放庫／提交／雜湊／資料夾），沒有人工校對；不確定的有 `GitHistoryGraph.sources`（直譯「來源」）、`folder.multi.repo.panel.groupChanges`／`groupNoChanges`（譯成「有變更／無變更」）、`cmd.j.quick.actions.verbs.gitLog` 保留 `git log`。
