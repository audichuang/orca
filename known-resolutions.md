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

## 4cee4b1ba63033d4a76c8c8c8091319ed579a20e（#35809）、a50a44bb8df9a193b91afb8c54d11a4ad99f1c14（#35597）、3ce252c79a26889ff10dd303796adda3c3e1e959（#35652）、006bbb28e79172116053b2b6f64fcfcdc1044ed4（#34906）、5616230ecdad2a80cc00412867c531a56d9d150c（#35517）、12a7d4c13a60c81e5e12c9f76e101357b3ee7a51（#35399）、79ba74dc3866218f30211bfd9bb032bb1ea4c870（#35619）、7980f2c23f1b5304890793ab133bd5c1d721bc42（Fix mobile download button destination）、ec58374a4c9a0ada905c4bd625067646c0971593（#35992）；71bcf131a45de04fb27be17f7d906d8c407d55e4（#36382）、1cefa152c979d7d2c0f7049a09bb4892acc01935（#36383）、24cebf03b501b3b7d80290bf8542d31e3f8924ed（#36234）、596e5f52d6353341b671965ac211def7cb21913a（#36216）× 無 fork commit — canary 2026-10-30、2026-10-31
- 類型：上游自己（release 分支與 main 各改一次）；auto-rebase 不用處理
- 衝突檔：2026-10-30 .github/workflows/pr.yml、src/renderer/src/components/mobile/use-mobile-install-actions.ts；2026-10-31 .github/workflows/computer-task-benchmark.yml（報告的 fork 欄都空白）
- 連帶症狀：無
- 處理：v1.4.244 的 f37e6b2c0c（ci: sync release workflows with main for the v1.4.244 cut）、c36ea7e969（#35619 在 release 分支的版本）、a61f37803c（Fix mobile download button destination 的 release 版本）在 merge-base b378dd183a 之後，fork 版這兩個檔與 v1.4.244 逐位元組相同（`git diff --quiet v1.4.244 fork/develop -- <檔>`），所以只是 canary 把整個 develop（含 v1.4.244）合進 main 才出現的衝突；canary 重設成上游 main 就是正解。auto-rebase 只重放 `vOLD..develop` 的 fork commit，不碰這兩個檔。與 resolution-history 裡 8d908764dc 那條同型：之後 canary 看到 fork 欄空白、檔案在 vOLD 的 release 分支 commit 裡的衝突，就歸這條。
- 守它的測試：無
- 驗證（2026-10-30，上游 4217095c06e684c6463eac026c28c807c4021a18）：兩個檔 `git diff --quiet v1.4.244 MERGE_HEAD` 成立；採上游後 tc 與測試全過。
- 2026-10-31 同型：develop 已在 v1.4.245，computer-task-benchmark.yml 的 fork 版與 v1.4.245 逐位元組相同（v1.4.245 的 4d5547e23f「ci: sync release workflows with main for the v1.4.245 cut」在 merge-base ec62243ded 之後）；上游 main 之後又改了 4 次（上面 4 個 sha）。
- 驗證（2026-10-31，上游 a079f519910d7352e11ebd56198fd34dfc8918c2）：`git diff --quiet v1.4.245 MERGE_HEAD -- .github/workflows/computer-task-benchmark.yml` 成立；採上游後 tc、測試、上游 lint 全過。

## 5a925965d5a984691d31199ec3a57526a9297bfc（#34779、fix(git): compare staged renames against their HEAD source）× fork fd15fa9558（refactor: carry fork values in options objects instead of trailing positional params）、226cc2e007（refactor: finish moving fork params into options objects and pin the remaining hops）、e50ff438e0（fix(source-control): 修正 folder workspace 多 repo 與 ClipCode 交叉測試找到的問題）、d4ac764be9（feat(source-control): folder workspace 多 repo 變更面板、ClipCode 複製與還原,移植到 v1.4.229）、1bffd51a2e（feat(source-control): git 歷史支援多分支、分支篩選與 git 端搜尋(後端)）、49541d5c2f（refactor(git-graph-tab): route upstream editor-kind sites through fork-editor-tab-kinds）、75deec9118（feat(source-control): Git Graph 改成編輯器分頁,可切換 repo,並加上快捷鍵與 Cmd+J 進入點）、4b7966a4eb（fix(source-control): folder 分頁的 git/讀檔改由 filePath 推導 repo 相對路徑…）— canary 2026-10-31
- 類型：兩邊各改各的（另含上游改了 fork 依賴的 API：上游在 provider `getDiff` 與 `runtime.getRuntimeGitDiff` 的尾端加了位置參數 `oldPath`，正好是 fork `readOptions` 的位置）
- 衝突檔：src/main/git/source-control/file-diff.ts（4 個 hunk）、src/main/ipc/filesystem/filesystem-git-status-handlers.ts（2）、src/main/providers/{git-provider-contract,local-git-provider}.ts、src/main/runtime/rpc/methods/git-diff-methods.ts、src/main/runtime/runtime-git-diff-commands.ts（2）、src/preload/api/{git-bridge,git-inspection-api}.ts、src/renderer/src/components/right-sidebar/source-control/listing/open-uncommitted-entry.ts、src/renderer/src/runtime/runtime-git-diff-client.ts（2）、src/renderer/src/store/slices/editor/git/git-status-reconciliation.ts、src/renderer/src/web/preload-api/web-git-api.ts（2）、src/shared/rpc-contract/git-params.ts（`GitDiff` 那個 hunk；import 那個 hunk 屬 #35347／#36160 條目）
- 連帶症狀：typecheck 錯誤 src/main/git/source-control/file-diff.skip-render-limit-real-git.test.ts、src/main/runtime/rpc/methods/{git-diff-skip-render-limit.test.ts,git.ts}、src/renderer/src/components/right-sidebar/source-control/listing/open-uncommitted-entry.fork.test.ts、src/renderer/src/runtime/runtime-git-diff-skip-render-limit-client.test.ts、src/renderer/src/store/slices/editor/actions/git-status-actions.ts、src/renderer/src/web/preload-api/web-git-diff-skip-render-limit.test.ts；失敗測試 src/shared/fork-editor-kind-sites.guard.test.ts、src/main/runtime/{runtime-git-diff-skip-render-limit-chain,runtime-git-history-graph-chain}.test.ts、src/main/git/source-control/{blob-absence-real-git.fork,file-diff.read-failure,file-diff.skip-render-limit-real-git}.test.ts、src/renderer/src/components/git-graph-tab/git-graph-tab-kind-seams.test.ts、src/renderer/src/runtime/runtime-git-diff-skip-render-limit-client.test.ts、src/renderer/src/web/preload-api/{web-git-diff-skip-render-limit,web-git-history-graph}.test.ts、src/main/ipc/filesystem/{filesystem-git-diff-skip-render-limit-ipc,filesystem-git-history-graph-ipc}.test.ts、src/main/runtime/rpc/methods/{git-diff-skip-render-limit,git-history-graph-rpc}.test.ts、src/renderer/src/store/slices/editor/git/git-status-reconciliation.perf.fork.test.ts、open-uncommitted-entry.fork.test.ts（全部是衝突重設造成，照下面合好就過）；合好後上游 lint 的 `oxlint` 報 web-git-api.ts `max-lines`（305 > 300，見下面的處理）
- 處理（原則：上游的 `oldPath` 在前，fork 的 `skipRenderLimit`／`readOptions` 接在後面）：
  - file-diff.ts：採上游 `type FileDiffOptions`，改成 `GitRuntimeOptions & GitDiffReadOptions & { oldPath?: string }`；三處 `options:` 都用 `FileDiffOptions`；readKey 兩行都留（上游 `staged ? (options.oldPath ?? null) : null,` 在前，fork `options.skipRenderLimit === true,` 在後）。
  - git-provider-contract.ts：`compareAgainstHead?: boolean, oldPath?: string, readOptions?: GitDiffReadOptions`。local-git-provider.ts：`(worktreePath, filePath, staged, compareAgainstHead, oldPath, readOptions) => getDiff(…, { ...interactive, ...(oldPath ? { oldPath } : {}), ...readOptions })`。
  - runtime-git-diff-commands.ts：簽章 `maxContentBytes?: number, oldPath?: string, readOptions?: GitDiffReadOptions`；provider 呼叫 `compareAgainstHead, oldRelativePath, readOptions`。
  - git-diff-methods.ts：衝突區只留 fork 的 `remoteDiffContentBudget(clientKind, requestId), ...gitDiffReadArgs(params)`（丟上游的 `...(params.oldPath ? …)` 那行），並改 fork 檔 src/main/git/source-control/git-diff-read-options.ts 的 `gitDiffReadArgs`：參數型別 `GitDiffReadOptions & { oldPath?: string }`，回傳型別 `[oldPath?: string, readOptions?: GitDiffReadOptions]`；有 `skipRenderLimit` 回 `[params.oldPath, { skipRenderLimit: true }]`，否則 `params.oldPath ? [params.oldPath] : []`（上游的呼叫不帶 fork 旗標時參數個數跟上游一樣；用 union tuple 當回傳型別 tc 會報 TS2345）。
  - filesystem-git-status-handlers.ts：`args` 型別兩行都留（`oldPath?: string`、`skipRenderLimit?: boolean`）；`getDiff` options 用上游的多行物件，最後加 `skipRenderLimit: args.skipRenderLimit`。
  - git-bridge.ts、git-inspection-api.ts：兩行都留（上游 `oldPath?: string` 在前）。
  - runtime-git-diff-client.ts：`args` 用 fork 的多行型別，`compareAgainstHead?` 後加 `oldPath?: string`；local 物件兩行都留（上游 `...(args.oldPath ? …)` 在前）。
  - web-git-api.ts：`diff: async ({ skipRenderLimit, ...args }) => {` 下一行 `const { worktreePath, filePath, staged, compareAgainstHead, oldPath } = args`，物件尾端上游 `...(oldPath ? { oldPath } : {})` 在前、fork `...(skipRenderLimit ? { skipRenderLimit: true } : {})` 在後（直接把兩個名字都塞進解構會被 oxfmt 拆成 8 行，推過 `max-lines`；這樣寫 305 行、oxlint 通過）。
  - git-params.ts `GitDiff`：`compareAgainstHead`、`oldPath`、`skipRenderLimit` 三行。
  - open-uncommitted-entry.ts：採上游的多行 `openDiff`（含 staged rename 的 `oldPath`），第一個參數改 fork 的 `tabWorktreeId`。
  - git-status-reconciliation.ts：採上游的 `(originalFile) => { let file = originalFile`，判斷改 fork 的 `getOpenFileGitWorktreeId(file) !== worktreeId`。另把上游新加的 `stagedEntriesByPath.get(file.relativePath)` 改成 `.get(gitRelativePathOf(file))`（folder 分頁的 `relativePath` 是相對 folder，status 的 path 相對 repo；不改的話 folder 分頁的 staged rename 永遠拿不到 `branchOldPath`）。這一處沒有測試守，auto-rebase 照做算 MANUAL，要補 fork 測試（folder 分頁的 staged rename 在 reconcile 後帶上 `branchOldPath`）並證明拿掉會紅。
  - fork 測試（額外 commit 或併進衝突解）：file-diff.skip-render-limit-real-git.test.ts 的 provider 呼叫改 `createLocalGitProvider().getDiff(repo, 'big.txt', true, false, undefined, { skipRenderLimit })`；git-diff-skip-render-limit.test.ts 的期望改成 `('id:wt-1', 'a.ts', true, undefined, undefined, undefined, { skipRenderLimit: true })`。
  - 合好的檔在 `~/.cache/orca-fork-canary/20261030T213048Z-88484/resolution/files/`（整份 diff：上一層的 `resolution.diff`）；vNEW 跟上游 main 不同時照上面的描述做，不要直接複製。
- 守它的測試：上面列的失敗測試（fork-seam-tests 的 skipRenderLimit 組、git history graph 組、folder 組）、`pnpm tc`、上游 lint 的 `oxlint`（max-lines）
- 驗證（2026-10-31，上游 a079f519910d7352e11ebd56198fd34dfc8918c2）：在 canary worktree 套上本次全部條目後 `pnpm tc` 通過；canary 那 180 個測試檔 1016 個測試全過；`make fork-check-seams` 90 檔 534 測試全過；上游 lint 全套（`fork-lint-run.mjs`）通過；`fork-upstream-api.mjs HEAD` 通過。`gitRelativePathOf` 那處沒有 mutation 驗證。

## 6b937c7e5f5a8d2cfcb755c6708ac38a632b3012（#35347、fix(source-control): resolve delete/modify conflicts and complete merges from the panel）、dc9928108597fcf35690a76f5616d20cfea4bed7（#36160、feat(source-control): resolve merge conflicts and complete merges from the phone）× fork d4ac764be9（feat(source-control): folder workspace 多 repo 變更面板、ClipCode 複製與還原,移植到 v1.4.229）、20993ea706（refactor(clipcode): move Copy Full Source out of upstream components into fork slots）、6860a18f1d（feat(source-control): Git 介面順手度優化第一批）、da9b76691a（refactor(source-control): let the folder save-hold helpers take one target or a list）、d5bed0235c（fix(source-control): release autosave holds after fork discard and ClipCode restore）、1bffd51a2e（feat(source-control): git 歷史支援多分支、分支篩選與 git 端搜尋(後端)）— canary 2026-10-31
- 類型：兩邊各改各的（上游加「右鍵解衝突」：`conflictResolutions`／`onResolveConflict` prop、`handleResolveConflict`；fork 在同一處有 `viewItems`／`copyItems` slot 與 folder 的 autosave hold）
- 衝突檔：src/renderer/src/components/right-sidebar/source-control/commit/use-entry-mutations.ts（2 個 hunk，都在 import 區）、src/renderer/src/components/right-sidebar/source-control/listing/entry-context-menu.tsx（2）、src/renderer/src/components/right-sidebar/source-control/listing/uncommitted-entry-row.tsx、src/shared/rpc-contract/git-params.ts（import 那個 hunk）。報告在 git-provider-contract／local-git-provider／git-bridge／web-git-api 也列這兩個上游 commit，但那些衝突 hunk 屬 #34779 條目。
- 連帶症狀：typecheck 錯誤 src/renderer/src/components/right-sidebar/source-control-entry-context-menu.fork.test.tsx、src/renderer/src/components/right-sidebar/source-control/listing/entry-context-menu.show-file-history.test.tsx、src/renderer/src/components/right-sidebar/source-control/sync/git-history-commit-files-menu.tsx（`viewItems` 不存在：衝突重設造成）、src/renderer/src/components/right-sidebar/source-control/listing/section-action-buttons.fork.test.tsx（缺必填 `handleResolveConflict`：不是衝突，要改 fork 測試）；失敗測試 source-control-entry-context-menu.fork.test.tsx、entry-context-menu.show-file-history.test.tsx、src/renderer/src/components/right-sidebar/source-control/commit/{folder-discard-autosave-holds.test.tsx,use-entry-mutations.fork.test.tsx}
- 處理：
  - use-entry-mutations.ts：import 寫成 `import { requestEditorFileSave } from '@/components/editor/editor-autosave'` 接 fork 的 `notifyEditorExternalFileChangeForOwners, requestEditorSaveQuiesceForOwners` from `'../folder/repo-editor-owner-save-holds'`；第二個 hunk 兩行都留（上游 `useAppStore` 在前、fork `useSourceControlWorktreeScope` 在後）。上游新的 `handleResolveConflict` 在 `keep_deletion` 路徑用 `requestEditorSaveQuiesce(editorTarget)`／`notifyEditorExternalFileChange(editorTarget)`，照 fork discard 的做法改成 `requestEditorSaveQuiesceForOwners(editorWorktreeId, editorTarget)`／`notifyEditorExternalFileChangeForOwners(editorWorktreeId, editorTarget)`，依賴陣列加 `editorWorktreeId`（folder workspace 的分頁屬 folder key，不改的話開著的 folder 分頁 autosave 沒被 hold，可能把剛刪的檔寫回來）。這處沒有測試守，auto-rebase 照做算 MANUAL，要補 fork 測試（仿 folder-discard-autosave-holds.test.tsx：folder 的 keep_deletion 會 hold 住 repo 與 folder 兩個 owner）並證明改回上游會紅；來不及補就先只合 import、不改邏輯，在 PR 說明列為既有缺口。
  - entry-context-menu.tsx：props 解構兩邊都留（上游 `conflictResolutions, onResolveConflict` 在前、fork `viewItems, copyItems` 在後）；JSX 先 fork 的 `{viewItems}`（緊接 View），再上游的解衝突區塊。
  - uncommitted-entry-row.tsx：兩邊都留（上游 `conflictResolutions`／`onResolveConflict` 在前，fork `viewItems`／`copyItems` 在後）。
  - git-params.ts import：兩行都留（上游 `CONFLICT_RESOLUTIONS` 在前、fork `GitHistoryGraphParams` 在後）。
  - fork 測試 section-action-buttons.fork.test.tsx：`handleUnstage={vi.fn()}` 後加 `handleResolveConflict={vi.fn()}`（額外 commit；上游 section-action-buttons.test.tsx 同寫法）。
- 守它的測試：上面列的失敗測試（fork-seam-tests「Upstream component slots and folder routing」組、folder discard 組）、`pnpm tc`
- 驗證（2026-10-31，上游 a079f519910d7352e11ebd56198fd34dfc8918c2）：同 #34779 那條；`keep_deletion` 改走 ForOwners 那處沒有 mutation 驗證。

## 5c30ebaca97b3e964b1fc04e98162de617ed6f5f（#36301、Highlight the active committed file in Source Control）× fork d4ac764be9（feat(source-control): folder workspace 多 repo 變更面板、ClipCode 複製與還原,移植到 v1.4.229）、20993ea706（refactor(clipcode): move Copy Full Source out of upstream components into fork slots）、e50ff438e0（fix(source-control): 修正 folder workspace 多 repo 與 ClipCode 交叉測試找到的問題）、226cc2e007（refactor: finish moving fork params into options objects and pin the remaining hops）、0405e6358f（refactor(source-control): derive folder tab and git owners in one fork helper）、aa5ef85485（test(source-control): guard folder discard notices, markdown notes and branch rows）— canary 2026-10-31
- 類型：兩邊各改各的（另含 fork 改過的上游 API：fork 在 d4ac764be9 拿掉了 `useSourceControlRowOpening`／`useFileListing` 的 `isMac`，上游新測試還在傳）
- 衝突檔：src/renderer/src/components/right-sidebar/source-control/listing/branch-entry-row.tsx（import 區）、src/renderer/src/components/right-sidebar/source-control/listing/use-row-opening.ts；uncommitted-entry-row.tsx 也列了這個 commit，但衝突 hunk 屬 #35347／#36160 條目
- 連帶症狀：typecheck 錯誤 src/renderer/src/components/right-sidebar/source-control/listing/{use-file-listing.ts,use-row-opening.ts}（`isMac`、`Expected 1 arguments, but got 2`：衝突重設造成）、use-row-opening.fork.test.tsx（缺 `visibleBranchRowKeys`）、use-file-projection-work.test.tsx 第 494 行（`isMac` 不存在）；失敗測試 use-row-opening.fork.test.tsx
- 處理：
  - branch-entry-row.tsx：fork 的 `import { OpenToSideMenuItem } from './entry-context-menu-slots'` 在前，接上游三行的 `getSourceControlRowHighlightClass, SOURCE_CONTROL_TREE_FILE_PADDING_PX, SOURCE_CONTROL_TREE_INDENT_PX` import。
  - use-row-opening.ts：用 fork 的 `if (!activeFile) return null` 與 `resolveActiveFileRepoRelativePath(...)`，最後呼叫改成上游的四參數 `buildActiveOpenFileSignature(activeFile.diffSource, repoRelativePath, activeFile.branchCompare, branchSummary)`。上游自動合入的 `visibleBranchRowKeys` 參數照收；不要加回 `isMac`。
  - 測試（額外 commit）：fork 的 use-row-opening.fork.test.tsx 在 `visibleSelectionEntries: [],` 後加 `visibleBranchRowKeys: [],`；上游的 use-file-projection-work.test.tsx 刪掉 #36301 新案例裡的 `isMac: true,`（fork 的 `useFileListing` 沒有這個參數，fork 先前已在同檔其他案例刪過）。
- 守它的測試：use-row-opening.fork.test.tsx、上游 SourceControl.open-file-highlight.test.tsx、use-file-projection-work.test.tsx、`pnpm tc`
- 驗證（2026-10-31，上游 a079f519910d7352e11ebd56198fd34dfc8918c2）：同 #34779 那條。

## 2078ebb959f4af6ed7b1e583c9faeffa3fdaf52e（#36308、Keep tab right-click menus open through the opening release）、a17b6706f542ef710a52c66b368bee334757b305（#36191、fix(explorer): open folder links that lead outside the project again）× fork 20993ea706（refactor(clipcode): move Copy Full Source out of upstream components into fork slots）、a9b4201a60（feat(file-explorer): 檔案總管右鍵 Copy Full Source,可多選檔案與整個資料夾(ClipCode 格式)）— canary 2026-10-31
- 類型：兩邊各改各的
- 衝突檔：src/renderer/src/components/right-sidebar/file-explorer-row-context-menu.tsx（import 區）
- 連帶症狀：失敗測試 src/renderer/src/components/right-sidebar/{file-explorer-clipcode-copy.wiring,file-explorer-row-context-menu.fork}.test.tsx（衝突重設造成）
- 處理：兩行都留：上游 `import { fileExplorerNodeTabRelativePath } from './file-explorer-directory-listing'` 在前，fork `import { ClipcodeExplorerCopyItem } from './source-control/clipcode/clipcode-menu-items'` 在後。
- 守它的測試：上面兩個測試檔、`pnpm tc`
- 驗證（2026-10-31，上游 a079f519910d7352e11ebd56198fd34dfc8918c2）：同 #34779 那條。

## 6efdd36dcb4fc6de93ac4b2554c77a4044d6f2af（#36233、fix(ui): notification cards lift above a chat composer they would cover）× fork cdd12598dc（fix(source-control): keep toasts above the bulk action bar）— canary 2026-10-31
- 類型：兩邊各改各的（上游把 toast 底部的 `2.5rem` 換成 `NOTIFICATION_CARD_STACK_BOTTOM`，讓開聊天輸入框；fork 用 `max(…, clearance)` 讓開 bulk action bar，兩者讓的是不同的 chrome）
- 衝突檔：src/renderer/src/components/ui/sonner.tsx（2 個 hunk：import 區、`TOASTER_OFFSET.bottom`）
- 連帶症狀：失敗測試 src/renderer/src/components/ui/sonner.fork.test.tsx（衝突重設造成）
- 處理：import 兩行都留（上游 `NOTIFICATION_CARD_STACK_BOTTOM` 在前、fork `TOAST_BOTTOM_CLEARANCE_VAR` 在後）；bottom 寫成 fork 的 `// Fork-only:` 註解加 `` bottom: `max(calc(${NOTIFICATION_CARD_STACK_BOTTOM} + env(safe-area-inset-bottom, 0px) + var(${NOTIFICATION_CARD_STACK_HEIGHT_VAR}, 0px)), var(${TOAST_BOTTOM_CLEARANCE_VAR}, 0px))`, ``（上游運算式整段包進 fork 的 `max(…)`，與 v1.4.245 rebase 時 sonner.tsx 的解法同型）。
- 守它的測試：sonner.fork.test.tsx（`lifts toasts above registered bottom chrome on wide and narrow windows`）
- 驗證（2026-10-31，上游 a079f519910d7352e11ebd56198fd34dfc8918c2）：同 #34779 那條。

## f22a7d43b59bc9f152e38c1acb3b5f7b4077c8d7（#36433、refactor(source-control): move the changed-file tree builder to src/shared）× fork 339bd5869d（feat(source-control): Git Graph 的 Changed files 改成依資料夾分層的樹狀顯示）— canary 2026-10-31
- 類型：上游改了 fork 依賴的 API（`source-control-tree.ts` 從 renderer 的 right-sidebar 搬到 `src/shared/`）
- 衝突檔：無
- 連帶症狀：typecheck 錯誤 src/renderer/src/components/right-sidebar/source-control/sync/git-history-commit-files.tsx（TS2307）；失敗測試（都是 `Failed to resolve import "../../source-control-tree"`）src/renderer/src/components/git-graph-tab/GitGraphTabView.component.test.tsx、src/renderer/src/components/right-sidebar/{SourceControl.preview-open.fork,SourceControl.preview-open}.test.tsx、src/renderer/src/components/right-sidebar/source-control/panel/{panel-capped-status-copy,panel-clipcode-actions.fork}.test.tsx、src/renderer/src/components/right-sidebar/source-control/sync/{git-graph-full-view-state,git-graph-full-view-tab-host,git-graph-full-view,git-graph-open-commit,git-graph-tab-launcher,git-history-graph,git-history-show-in-graph}.component.test.tsx、src/renderer/src/components/right-sidebar/source-control/sync/{git-history-commit-files-menu,git-history-commit-files}.test.tsx
- 處理（額外 commit）：git-history-commit-files.tsx 的 `} from '../../source-control-tree'` 改成 `} from '../../../../../../shared/source-control-tree'`（上游 branch-section.tsx 同樣改法）。
- 守它的測試：`pnpm tc`、上面列的測試
- 驗證（2026-10-31，上游 a079f519910d7352e11ebd56198fd34dfc8918c2）：同 #34779 那條。

## d0bdbfb314e84b7d70d92a0c98f46908944a9aa5（#34104、fix(updater): keep status current after reopening the window）× fork b82c17d5c5（refactor(fork): stop exporting upstream internals the fork reads）— canary 2026-10-31
- 類型：上游改了 fork 依賴的 API（`UpdaterState.mainWindowRef` 改成 `getMainWindow: () => BrowserWindow | null`）
- 衝突檔：無
- 連帶症狀：typecheck 錯誤與失敗測試 src/main/updater/updater-nudge.fork.test.ts（`Property 'mainWindowRef' does not exist on type 'Probe'`）
- 處理（額外 commit）：updater-nudge.fork.test.ts 的 `Probe` 建構子 `this.mainWindowRef = window` 改成 `this.getMainWindow = () => window`。
- 守它的測試：updater-nudge.fork.test.ts
- 驗證（2026-10-31，上游 a079f519910d7352e11ebd56198fd34dfc8918c2）：同 #34779 那條。

## 2e37fc45717f7eb898ca98f89ea0c17e218f57d4（#35004、fix(editor): scroll combined diffs with keyboard navigation）× fork 590eafc175（fix(source-control): 依第二輪 QA 修正:combined diff 在 dev StrictMode 不再 crash、多選複製 hash/訊息涵蓋全部選取、Git Graph 可在旁邊開 diff）、52493540d5（test(editor): give the strict-reveal fake Monaco model isDisposed and getLanguageId）— canary 2026-10-31
- 類型：上游改了 fork 測試依賴的 Monaco API（DiffSectionBody mount 時呼叫 `installCombinedDiffCursorReveal`，會用 `diff.getContainerDomNode()`）
- 衝突檔：無
- 連帶症狀：失敗測試 src/renderer/src/components/editor/DiffSectionBody.monaco-strict-reveal.test.tsx（2 例：`TypeError: diff.getContainerDomNode is not a function`；第二例連帶 `expected [ 'create', 'dispose' ] to deeply equal [ 'create' ]`）
- 處理（額外 commit）：fork 測試 `createDiffEditor` 回傳的物件加 `getContainerDomNode: () => document.createElement('div'),`（上游 DiffSectionBody.word-wrap-lifecycle.test.tsx 同寫法；離線的 div 找不到 combined diff viewport，reveal 直接 no-op）。
- 守它的測試：DiffSectionBody.monaco-strict-reveal.test.tsx
- 驗證（2026-10-31，上游 a079f519910d7352e11ebd56198fd34dfc8918c2）：該檔 2 例通過；其餘同 #34779 那條。
