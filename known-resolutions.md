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

## 9bd6272fdf4e1f2bbef43ac8c56722cf2ba31641（#38130、refactor(tooling): organize build, CI, and test owners）× fork 9f5b5d731a（ci(fork): undo v1.4.250's workflow sync so its config/scripts tests read matching workflows）— auto-rebase 2026-11-05
- 類型：上游修了同一件事（上游 release commit 151d5dda99 把 main 的 `.github/workflows` 同步進 release/v1.4.250、`config/scripts` 留舊版，5 支讀 workflow 的 config/scripts 測試 18 例紅；fork 撤回那次同步。含 #38130 的 release 會讓 workflow 與腳本重新一致）
- 衝突檔：下一次含 #38130 的 release，rebase 重放 9f5b5d731a 時 39 個 `.github/workflows/*.yml` 幾乎全部衝突（patch-id 跟上游不同，**不會自動略過**）
- 連帶症狀：不丟的話 workflow 回到 v1.4.249 時代的腳本路徑，讀 workflow 的 config/scripts 測試（adhoc-windows-parallelism、localization-extraction-change-scope、node-server-native-compat-scope、pr-auxiliary-preflight-admission、pr-workflow-parallelism 等）會再紅
- 處理：適用條件 `git merge-base --is-ancestor 9bd6272fdf vNEW`。成立就照第 1 步「丟 commit」：用標題 `ci(fork): undo v1.4.250's workflow sync so its config/scripts tests read matching workflows` 在 `git log --format='%h %s' vOLD..OLD_DEVELOP` 找到剛好一個，`rebase -i` drop；range-diff 要看到它是 `<`。丟完後 `git diff vNEW HEAD -- .github/workflows` 應只剩 fork 原有的 `fork-pr.yml`、`fork-release.yml`、`ci-closed-pr-caches.yml`。不成立（下一個 release 仍是同步前的腳本版面）就照常重放。
- canary：從 2026-11-06 起對上游 main 試合，這 39 個 workflow 檔會衝突、fork 欄是這個 commit：採上游就是正解，歸這條，不用另寫條目。
- 守它的測試：上面 5 支 config/scripts 測試（Linux CI；macOS 的 bash 3.2 讓 pr-auxiliary-preflight-admission 8 例、ci-managed-ssh-execution、dependency-security-release 本機紅，與這個 commit 無關）
- 驗證（2026-11-05，上游 v1.4.250）：乾淨 v1.4.250 與 Fork CI r1（2d42a0615e，run 42018786601）都是 18 紅；撤回後 CI r2（9f5b5d731a，run 42020999924）全綠，本機 4 檔綠、剩 8 例 bash 3.2。

## 9bd6272fdf4e1f2bbef43ac8c56722cf2ba31641（#38130、refactor(tooling): organize build, CI, and test owners）× fork 的 Makefile、fork-pr.yml、fork-* 腳本與 skill（fork 獨有檔，不會出現衝突）— 2026-11-05 人工檢查
- 類型：上游改了 fork 依賴的 API
- 衝突檔：無。下面每個檔都只有 fork 有，rebase／canary 會靜靜合進去，到執行時才壞（`Cannot find module` 或 `No such file`）
- 連帶症狀：Fork CI 的 diff-base 與 Electron 安裝步驟、`make fork-check*`、`make fork-canary`、`fork-upstream-api.txt` 檢查、fork 腳本的 import 都會失敗。canary 從上游 main 含 #38130 起（2026-11-06 那次）在 `fork-canary.sh:156` 就會先失敗，原因是這條，不是新衝突
- 處理：適用條件跟 9bd6272fdf 丟 `9f5b5d731a` 那條一樣（`git merge-base --is-ancestor 9bd6272fdf vNEW`），兩條一起做。把 fork 獨有檔裡的舊路徑換成新路徑（新路徑以 vNEW 的 `git ls-tree -r --name-only vNEW config/scripts` 為準，下面是上游 main 6e91427ee7 的位置）：
  - `config/scripts/ensure-native-runtime.mjs` → `config/scripts/native-build/node-addons/ensure-native-runtime.mjs`：`Makefile`（FORK_VITEST 與兩個 target）、`config/scripts/fork-canary.sh`、`.claude/skills/orca-fork-auto-rebase/SKILL.md`、`.claude/skills/orca-fork-canary/SKILL.md`
  - `config/scripts/run-vitest.mjs` → `config/scripts/test-runtime/execution-policy/run-vitest.mjs`：`Makefile`
  - `config/scripts/run-mobile-web-app-checks.mjs` → `config/scripts/mobile-web/check-entry/run-mobile-web-app-checks.mjs`：`Makefile`
  - `config/scripts/git-pull-request-diff-base.mjs` → `config/scripts/git/pr-diff-base/git-pull-request-diff-base.mjs`：`.github/workflows/fork-pr.yml`
  - `config/scripts/install-electron-package-binary.mjs` → `config/scripts/electron-installation/platform-layout/install-electron-package-binary.mjs`：`.github/workflows/fork-pr.yml`
  - `config/scripts/ci-unit-dependency-graph.mjs` → `config/scripts/ci/unit-selection/dependency-graph/ci-unit-dependency-graph.mjs`：`config/fork-upstream-api.txt`、`config/scripts/fork-hunk-guard-scan.mjs`（相對 import）
  - `config/scripts/pr-code-change-scope.mjs` → `config/scripts/workflow/source-routing/pr-code-change-scope.mjs`：`config/fork-upstream-api.txt`、`config/scripts/fork-pr-scope.mjs`（相對 import）
  - `config/scripts/ci-unit-files.mjs` → `config/scripts/ci/unit-selection/dependency-graph/ci-unit-files.mjs`：`config/scripts/fork-test-inventory.mjs`
  - `config/scripts/test-only-source-path.mjs` → `config/scripts/static-analysis/process-boundaries/test-only-source-path.mjs`：`config/scripts/fork-footprint.mjs`、`config/scripts/fork-hunk-guard-scan.mjs`（相對 import）
  - `config/scripts/run-typecheck-projects-in-parallel.mjs` → `config/scripts/typecheck/project-execution/run-typecheck-projects-in-parallel.mjs`：`config/scripts/fork-upstream-red.test.mjs`
  - `config/scripts/build-computer-macos.mjs`、`config/scripts/ci-closed-pr-cancellation.test.mjs` → `native-build/macos/`、`ci/workflow-contracts/` 底下：`config/scripts/fork-footprint.test.mjs`
  fork 自己的 `config/scripts/fork-*` 留在根目錄（上游 main 根目錄已經沒有散檔，但沒找到強制檢查；若 vNEW 有就一起搬）。改完用 `git grep -n -F -f <(git diff --name-status --format= vOLD vNEW -- config/scripts | awk '$1 ~ /^R/ {print $2}') HEAD -- ':!*.md' Makefile '.github/workflows/fork-*' 'config/fork*' 'config/scripts/fork*' '.claude/skills/orca-fork-*'` 確認沒有剩下舊路徑（skill 的 .md 另外 grep）。上面的清單是 2026-11-05 的 develop（9f5b5d731a）掃出來的，之後 fork 新加的引用以 grep 為準。
- 守它的測試：Fork CI 本身（fork-pr.yml 的步驟）、`make fork-check`、`config/scripts/fork-*.test.mjs`
- 驗證：未驗證（2026-11-05 對 fork/develop 9f5b5d731a 與上游 9bd6272fdf 的 rename 清單比對掃出；還沒在含 #38130 的版本上跑過）

## fork 自身問題（待人判斷，auto-rebase 不要照做：folder 層級的外部變更要不要配對到 repo-scoped diff 分頁：兩條路徑不一致）× fork c2a98a82aa（feat(source-control): folder workspace 多 repo 變更面板、ClipCode 複製與還原,移植到 v1.4.229）、71a91a6a02（fix(source-control): folder 分頁的 git/讀檔改由 filePath 推導 repo 相對路徑…）— auto-rebase 2026-10-27（原 sha ebae8279bd、a9b651f3b9，之後 d4ac764be9、4b7966a4eb、8ca8c6583b、0bb7357c8f、cee6406bd7、fa64c71117 都已被 rebase 改寫，canary 2026-11-05 依標題換成目前 develop 的 sha）
- 類型：待人判斷
- 衝突檔：無
- 連帶症狀：無（審查者 C 的 mutation：拿掉 `editor-autosave.ts:177` 的 `getOpenFileGitWorktreeId(file) === target.worktreeId`，所有測試仍綠）
- 處理（2026-11-05：上游 8d0e7a1bc6 把 `editor-autosave.ts` 搬到 `components/editor/autosave/editor-autosave.ts`、`editor-external-watch-path-index.ts` 搬到 `components/editor/external-changes/`，行號以搬家前為準）：`getOpenFilesForExternalFileChange` 的 fallback 路徑（沒有 `indexedOpenFiles` 時）用第 177 行排除「target 是 folder 本身、分頁是 repo-scoped diff」的情境；`editor-external-watch-path-index.ts` 的 index 路徑在同一情境以 `filePath` 配對、會包含它。第 177 行原本是為了 relativePath 撞名（8da7b7c407 之前用 relativePath 比對），現在 scoped 分頁已改用 filePath 比對，這個目的已由第 174 行達成。要使用者決定：刪掉第 177 行（跟 index 路徑一致），或讓 index 路徑也排除；決定後在 `editor-autosave.fork.test.ts` 補一個會咬的測試。不要在 auto-rebase 裡自己選一邊。
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
- 驗證（2026-11-05，上游 e7801630fa46feed463bcd26a9078d027bb8d572）：develop 已在 v1.4.248（merge-base 14819eb8c0），同型 47 個衝突檔（`v1.4.248..develop` 沒有 fork commit；新路徑、舊路徑兩種都查過，`git diff --quiet v1.4.248 MERGE_HEAD -- <舊路徑>` 都成立）：主要是 v1.4.248 release 分支的 abb207b6f2（#37213）、f4ad72ba6d（#37205）、3f8493e20c（#37873）、95eea39ed6（#37922）、76e8aa8c12（#37797）、92ac9df421（#37751）改的 src/main/native-chat/agent-session-wire/*、src/renderer/src/components/agent/AgentLaunch*、settings/{chat,repository,source-control}/*、src/shared/agent-launch/picker/*、src/shared/source-control/ai/*、src/main/codex/structured/*，其中 modify/delete 4 個、add/add 11 個。同一串有兩個不是衝突的症狀要 canary 自己清：(1) release 分支在舊路徑新增、上游 main 搬走或刪掉的 18 個檔被合進來（typecheck 錯誤與 type-aware lint 的來源）：`git rm` src/main/codex/codex-structured-start-{endings.test,verdict}.ts、src/main/provider-process/provider-exit-drain-scaling.test.ts、src/renderer/src/components/settings/{SourceControlTextActionAgentPicker.tsx,source-control-action-recipe-draft-sync.test.tsx,source-control-text-action-*.ts(x)（6 個）,use-text-action-model-discovery.ts}、src/shared/{source-control-ai-action-model-choice.ts,source-control-ai-action-model-edits{,.test}.ts,source-control-ai-argument-flags{,.test}.ts,source-control-text-action-picker.ts}（main 在 settings/source-control/text-actions/、shared/source-control/ai/{settings,recipes}/ 有對應檔，其餘被 #38030、#37915 刪掉）；挑法：`git diff --name-only --diff-filter=A <merge-base> v1.4.248` 裡、K 有而 HEAD 沒有、`v1.4.248..MERGE_HEAD` 沒 fork commit 的檔。(2) src/main/runtime/agent-session/structured-agent-session-adapter-start-failure.test.ts 自動合入後 3 個測試標題重複（上游 `audit:code-quality:native` 的 `vitest(no-identical-title)` 紅）：`git checkout HEAD -- <檔>`。都不在 `v1.4.248..develop`，auto-rebase 不用處理。做完後 `audit:code-quality:native`、`audit:code-quality:type-aware`、`check:runtime-electron-ratchet` 通過。

## fork 自身問題（folder repo diff 的筆記 owner 在 remote 情境沒有真 store 斷言）× fork 既有 folder 多 repo 筆記接線（CombinedDiffViewer、EditorPanelHeader 的 `useVisibleWorktreeDiffComments(getOpenFileGitWorktreeId(file), file)`）— auto-rebase 2026-11-04
- 類型：fork 自身問題
- 衝突檔：無
- 連帶症狀：無（v1.4.248 rebase 審查者 B 的 NON-BLOCKING 發現 1）
- 處理：上游 e59b843336（v1.4.248）讓筆記改由 `DiffCommentOwner` 決定；`selectDiffCommentView(gitWorktreeId, folderTab)` 走 `resourceEvidence`（`workspace-copy-owner.ts:194-222`），folder 分頁的 `operationProvenance` 沒有 `childRepo`，會用 folder 路由的 authority 去找 repo worktree 的筆記。本機與同一台 runtime/SSH 上 authority 相同、讀碼看會解析成功，但沒有測試證明；解析失敗時 owner 是 null、那個 section 不能新增或刪除筆記。目前的 fork 測試 `combined-diff-section-list.fork.test.tsx` 直接傳 `commentOwner={null}`、`EditorPanelHeader.fork.test.tsx` mock 掉 selector。補一個 `.fork.test`：用真的 store（含 remote repo 的 folder 分頁）斷言 owner 不是 null，且 `addDiffComment` 寫進 repo 那份筆記；加進 config/fork-seam-tests.txt 的「Editor folder git-owner routing…diff review notes」組。
- 守它的測試：待補
- 驗證：未驗證（只有審查者 B 讀碼）
- 2026-11-05 auto-rebase v1.4.250（run 371）評估後未做：要用真 store 重建上游 host-authority／ownership catalog（`workspace-copy-owner.ts` 的 `resolveSourceCopy`、indexed owners）的 remote fixture，超出無人值守 rebase 的範圍。適合人工或功能 PR 補。

## fork 自身問題（待人判斷，auto-rebase 不要照做：fork 測試的 vi.mock 指向不存在的模組，mock 沒生效；pwsh／wsl 屬 Platform scope，mock 生效後測試行為可能變，改 mock 路徑也沒有會紅的證明）× fork 既有測試 src/main/ipc/pty/pty-agent-pane-launch.fork.test.ts、src/main/ipc/repos-nested-scan-options.test.ts — auto-rebase 2026-11-05
- 類型：待人判斷
- 衝突檔：無
- 連帶症狀：無（v1.4.249 rebase 審查者 A、B、C 都列為 NON-BLOCKING；01f0e84e94 就是如此，測試照樣通過）
- 處理：`pty-agent-pane-launch.fork.test.ts:30-31` 的 `vi.mock('../../pwsh')`、`vi.mock('../../wsl')` 改成同目錄上游測試用的路徑（`'../../pty/shell-startup/pwsh'` 等，`rg "vi.mock\('.*pwsh'" src/main/ipc/pty` 對照）；`repos-nested-scan-options.test.ts:18-22` 的 `'../git/worktree'`、`'./registered-worktree-roots-cache'`、`'../worktree-root-preparation'` 改成 `./worktrees/removal/registered-worktree-roots-cache` 等現行路徑（`src/main/git/worktree` 不存在，看上游 `repos-nested-scan.test.ts:45` 的寫法決定要不要留）。改完兩支測試仍要綠。pwsh／WSL 只關 Windows，屬 Platform scope，不急。
- 守它的測試：src/main/ipc/pty/pty-agent-pane-launch.fork.test.ts、src/main/ipc/repos-nested-scan-options.test.ts
- 驗證：未驗證（只有讀碼與三位審查者的路徑比對）
