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

## fork 自身問題（待人判斷，auto-rebase 不要照做：folder 層級的外部變更要不要配對到 repo-scoped diff 分頁：兩條路徑不一致）× fork cee6406bd7（feat(source-control): folder workspace 多 repo 變更面板、ClipCode 複製與還原,移植到 v1.4.229）、fa64c71117（fix(source-control): folder 分頁的 git/讀檔改由 filePath 推導 repo 相對路徑…）— auto-rebase 2026-10-27（原 sha ebae8279bd、a9b651f3b9，之後 d4ac764be9、4b7966a4eb、8ca8c6583b、0bb7357c8f 都已被 rebase 改寫，canary 2026-11-04 依標題換成目前 develop 的 sha）
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
- 驗證（2026-11-01，上游 76e5e94b23b7fbebfcbd6b3843dd0941a7065848）：`git diff --quiet v1.4.245 fork/develop -- .github/workflows/computer-task-benchmark.yml` 仍成立（2487a258fe 之後上游沒再改這個檔）；採上游後 tc、測試、上游 lint 全過。
- 驗證（2026-11-01，上游 90a537434943a6dacf8cd13125e3f5752142c1b7）：`git diff --quiet v1.4.245 fork/develop -- .github/workflows/computer-task-benchmark.yml` 仍成立（76e5e94b23 之後上游沒再改這個檔）；採上游後 tc、測試、上游 lint 全過。
- 驗證（2026-11-03，上游 40f9d2a2468e05310caf1c5172524df0cd95b387）：develop 已在 v1.4.246，同型 12 檔（報告 fork 欄空白）：src/main/native-chat/agent-session-journal/journal-cursor.ts、src/main/native-chat/agent-session-wire/{structured-agent-session-native-responses,structured-agent-start-journal}.ts、src/renderer/src/components/native-chat/native-chat-composer-draft-{persistence,store}.ts、src/renderer/src/components/tab-bar/{TabBar.context-menu.test,cli-chat-resume-close-admission,cli-chat-resume-run-close.test,cli-chat-resume-run,tab-width-rules}.ts、src/renderer/src/lib/agent-session/launch/structured-agent-session-launch-draft.ts、src/renderer/src/lib/worktree-creation-structured-session.test.ts。12 檔 `git diff --quiet v1.4.246 MERGE_HEAD -- <檔>` 都成立，各自在 merge-base 54ef0dea20 之後有 v1.4.246 release 分支的 commit（ce4fd4d449 #37118、b165aed04e #36848、e74973ce5f #37258、b1792e667f #37131、a4bfe1d80e #37227），上游 main 之後又改過（81bcc6bc9a、9b39188021、42bdeffbe4、ef32c76c31、1b15d45a5e、ad864a6ec7、51cb2f189c、10a623b910、dedfa3c2b0、c3b7560fb4、ef79fa1693、21857c7424、a94f784f84、ba4535880b、ebf277b4aa）；採上游後 tc、測試、上游 lint 全過。
- 驗證（2026-11-04，上游 b029fb61ab5a69c06641708ad90e467be78c58a5）：develop 已在 v1.4.247（merge-base 7518c94fbd），同型共 17 個衝突檔（報告 fork 欄空白，`git diff --quiet v1.4.247 MERGE_HEAD -- <檔>` 都成立）：src/renderer/src/components/agent/AgentLaunchSetupPanel{.prompt.test,}.tsx、src/renderer/src/components/ui/{command,dropdown-menu,popover}.tsx（v1.4.247 的 8514c9fd7b #37403）、src/renderer/src/hooks/settings-navigation-interface-sections.ts（c03eb78d62 #37607）、src/shared/agent-session/options/structured-agent-session-permission-option{,.test}.ts、tests/e2e/structured-permission-report-publication.unit.test.ts（2d0bacc7ab #37419），以及上游 main 搬進子目錄、release 分支在舊路徑改過的 src/renderer/src/components/settings/advanced/{ExperimentalPane.tsx,experimental-search.ts}、settings/agents/surfaces/AgentDefaultSurfaceSection.tsx、settings/chat/ChatSettingsSection{,.navigation.test,.test}.tsx、settings/orchestration/{OrchestrationPanelExperimentalSetting.tsx,orchestration-panel-experimental-search.ts}（後兩個是 rename/delete：release 的 90360b939c 停用 orchestration panel 刪了舊檔，main 的 7863aefbc2 #37616 又恢復並搬家）。同一串還有兩個不是衝突的症狀，canary 要自己清：(1) release 分支在舊路徑新增、上游 main 放在新目錄的 5 個檔被合進來、import 全斷（typecheck 錯誤的來源）：`git rm` src/renderer/src/components/settings/{ChatAgentLaunchSettings.tsx,ChatSettingsSection.fixture.tsx,ExperimentalPane.fixture.tsx,chat-launch-search.ts}、src/renderer/src/components/orchestration-crew/orchestration-panel-suspended.test.tsx（main 已在 settings/chat/、settings/advanced/ 有對應檔，suspended 測試隨 #37616 刪除）；(2) en.json 少了 7 個 `orchestrationPanel` key（release 刪、main 恢復，合併取了刪除），就是上游 lint `verify:localization-extraction`、`verify:localization-catalogs` 紅的原因：照 HEAD 的位置把 `auto.components.settings.ExperimentalPane.orchestrationPanel.toggleLabel` 與 `auto.components.settings.experimental.search.orchestrationPanel.*` 補回（其他 locale 沒少）。都不在 `v1.4.247..develop`，auto-rebase 不用處理。採上游並做完上面兩點後，tc、兩個 localization 步驟、`fork-locale-parity.mjs HEAD` 全過。

## 6b2216d7c5c86d746d8405a1ad1ed8bafd8a81b1（#37888、test: remove 63 low-value test declarations）× fork cee6406bd7（feat(source-control): folder workspace 多 repo 變更面板、ClipCode 複製與還原,移植到 v1.4.229）— canary 2026-11-04
- 類型：兩邊各改各的（上游刪掉這個檔的大部分測試與 helper，fork 改了留下來那一例的標題與斷言）
- 衝突檔：src/renderer/src/components/right-sidebar/right-sidebar-titlebar-drag-regions.render.test.tsx
- 連帶症狀：失敗測試同檔「hides git-only activity buttons for folder workspace ids without a backing repo」（衝突重設成上游的舊斷言 `not.toContain('aria-label="Source Control')`）
- 處理：採上游（被刪的測試、`openingTag`／`buttonOpeningTag`／`expectNoDrag` helper 與 import 都不要加回），只把留下那例的標題換成 fork 的 `'hides git-only activity buttons except Source Control for folder workspace ids'`；fork 的 `// Folder workspaces keep Source Control…` 註解與 `toContain('aria-label="Source Control')` 自動合入。
- 守它的測試：這個檔本身
- 驗證（2026-11-04，上游 b029fb61ab5a69c06641708ad90e467be78c58a5）：該檔全過（在 canary 那批 211 檔內）。

## f75877136427189179f877c990e3ae3f05ecb025（#37910、refactor: group browser lifecycle and extension implementation owners；同一段還有 fced292c55c3fb2bd9feabda66e18133aa433d8b #37796 的 settings 路徑搬家）× fork 256fa57fe0（fix(git-graph): parse stored list prefs with zod and register their storage）、79410d66ff（ci(fork): run upstream's whole lint and the source-scan tests in fork-check）— canary 2026-11-04
- 類型：兩邊各改各的（上游把清單裡的 settings 路徑改成新目錄，fork 在相鄰位置插了 Git Graph 的兩個 localStorage 模組）；另有行數上限問題
- 衝突檔：src/shared/wsl-move/wsl-move-storage-dispositions.ts
- 連帶症狀：合好後 `pnpm exec oxlint` 報 `max-lines`（File has too many lines (301)，上限 300、不算空行與註解）：上游這個檔已有 302 行實體行，fork 加的 3 筆 disposition 剛好超過
- 處理：hunk 先放 fork 的兩行註解＋路徑（`…/source-control/sync/git-graph-full-view-details.tsx`、`…/source-control/sync/git-graph-list-prefs.ts`），再接上游的 `settings/browser/use/BrowserUsePane.tsx`、`settings/developer-permissions/local-network-connection-history.ts`（fork 那側的 `settings/BrowserUsePane.tsx`、`settings/local-network-connection-history.ts` 舊路徑不要）。再把自動合入的 fork 那筆 `folder-sidebar-hidden-repos.ts`（79410d66ff 加的）縮成兩行：`notApplicableDisposition(62, 'Keyed by host and repo path; a moved repo shows again.'),`（原本 5 行的 `notApplicableDisposition(\n 62,\n 'Keyed by execution host and repo path; a moved repo shows again and can be hidden again.'\n)`），行數回到上限內。上游之後再往這個檔加東西還會超過；到時考慮把 fork 的 3 筆移到 fork 自己的檔、用一行 spread 接進來。
- 守它的測試：`pnpm exec oxlint`（max-lines）、src/main/persistence/moving-wsl-projects/wsl-move-*.test.ts、src/main/native-chat/agent-session-journal/journal-saved-state.test.ts
- 驗證（2026-11-04，上游 b029fb61ab5a69c06641708ad90e467be78c58a5）：oxlint（所有改過的 .ts／.tsx）通過；`check:max-lines-ratchet` 通過；上面的 wsl-move 測試 5 檔 40 例全過。
- 2026-11-04 auto-rebase v1.4.248（PR #115）：f758771364 不在 v1.4.248，但 v1.4.248 已含 fced292c55 的 settings 路徑搬家，同一個 hunk 照上面做（fork 兩行在前、接上游新路徑）；合完 oxlint 報 `max-lines (301)`，縮行已在 develop 的 `bfc1ff287b`（fix(fork): keep wsl-move-storage-dispositions within max-lines after upstream's settings move (upstream fced292c55)）做掉。下一次含 f758771364 的 release 若同檔再衝突：fork 兩行照放、hidden-repos 那筆維持一行寫法、不要再縮；仍超過 300 就照上面最後一句把 fork 的 3 筆移到 fork 自己的檔。

## fork 自身問題（folder repo diff 的筆記 owner 在 remote 情境沒有真 store 斷言）× fork 既有 folder 多 repo 筆記接線（CombinedDiffViewer、EditorPanelHeader 的 `useVisibleWorktreeDiffComments(getOpenFileGitWorktreeId(file), file)`）— auto-rebase 2026-11-04
- 類型：fork 自身問題
- 衝突檔：無
- 連帶症狀：無（v1.4.248 rebase 審查者 B 的 NON-BLOCKING 發現 1）
- 處理：上游 e59b843336（v1.4.248）讓筆記改由 `DiffCommentOwner` 決定；`selectDiffCommentView(gitWorktreeId, folderTab)` 走 `resourceEvidence`（`workspace-copy-owner.ts:194-222`），folder 分頁的 `operationProvenance` 沒有 `childRepo`，會用 folder 路由的 authority 去找 repo worktree 的筆記。本機與同一台 runtime/SSH 上 authority 相同、讀碼看會解析成功，但沒有測試證明；解析失敗時 owner 是 null、那個 section 不能新增或刪除筆記。目前的 fork 測試 `combined-diff-section-list.fork.test.tsx` 直接傳 `commentOwner={null}`、`EditorPanelHeader.fork.test.tsx` mock 掉 selector。補一個 `.fork.test`：用真的 store（含 remote repo 的 folder 分頁）斷言 owner 不是 null，且 `addDiffComment` 寫進 repo 那份筆記；加進 config/fork-seam-tests.txt 的「Editor folder git-owner routing…diff review notes」組。
- 守它的測試：待補
- 驗證：未驗證（只有審查者 B 讀碼）
