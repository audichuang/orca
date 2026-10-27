# 處理紀錄

之前的 auto-rebase、canary 與人工處理各做了什麼，新的在最上面，只增不刪。遇到 `known-resolutions.md` 沒寫到的衝突或問題，先在這裡找同一個檔或同一個 fork commit 的前例照做。auto-rebase 每次 run 都會加一條；用掉的 `known-resolutions.md` 條目整段搬到這裡。只經 `config/scripts/fork-notes.sh` 寫。

## 2026-10-27 人工複查 auto-rebase run 141（v1.4.242，PR #86）
- 結果：照 SKILL.md 跑完，沒有偏離；develop = main = dfb4a446e8，tag／release／dmg／cask 一致，ar-* worktree 已清。審查者 A／B 都實際跑了指令（A 31 次、B 57 次 Bash，B 跑了 vitest），ACCEPTABLE 不是只讀 diff 給的。
- 啟動延遲不是 bug：上游 tag 23:16:32Z 建、Release 00:09:03Z 才發布，run 140（23:17）precheck 看到的 latest 還是 v1.4.241；run 141（00:17）在發布後 8 分鐘就接手。
- 第 6 步「seam 不是檔案」的判準跟 SKILL.md 原文（「落在 `seam-upstream.diff` 碰到的 seam 上」）一致，是釐清不是改規則。
- **之後照做**：vNEW 本身過不了某個 fork CI 會跑的上游檢查時，先在 `vNEW..origin/main` 找上游自己的修正，`cherry-pick -x` 帶進來（不要另寫 fork 版修法），每個 cherry-pick 做 mutation 證明；有衝突而採了 vNEW 側的，patch-id 會對不上，同一個 run 就要寫 known-resolutions 條目讓下一次 rebase 丟掉它（run 141 的 f34c13ca1e 就是這樣）。（更正：SKILL.md 第 2 步早已有「lint 紅 → 乾淨 vNEW 重跑 → cherry-pick -x」這條，FORK.md 也提到；缺的是「事先知道」。已改成第 1 步就在背景跑 `config/scripts/fork-upstream-red.mjs vNEW`，在第一輪閘門前就列出上游自己紅的步驟與 cherry-pick 候選，見 PR #87（fc95154f73）。它只是報告，不豁免任何檢查：FORK.md「Who checks what」禁止在 fork-check 裡加自動豁免。）
- **之後照做**：審查者找到的「既有缺口」不要只寫在這裡當債務：能補測試的寫成 known-resolutions「fork 自身問題」條目（含「守它的測試」），下一次 run 照做；要選行為的才標「待人判斷」。run 141 的 ②～④（CombinedDiffViewer `gitWorktreeId`、`openGitGraph` 快捷鍵、App bundle replaced IPC）與 Codex 的 fork-lint-run CLI 入口測試都還只在這裡。

## 2026-10-27 auto-rebase v1.4.241 → v1.4.242（PR #86）— develop 已移動並發 v1.4.242-fork.1
- 結果：develop = main = dfb4a446e8（舊 develop 備份 `backup/develop-v1.4.241-20261027T001750Z`），release run 40429975071 綠，cask 1.4.242-fork.1；MacBook 上 Orca Fork 開著，沒自動升級。MANUAL：range-diff 319 `=`、5 `!`、2 `<`、5 `>`；rerere 沒重放；locale driver 合好，沒停在 locale。
- 衝突（3 個，都照筆記）：df6ae0f346 `editor-external-watch-path-index.ts`（條目 17621d5368）、9179c28214 `build-computer-macos.mjs`（條目 8d18f318，整檔採 v1.4.242）、a0c670fca6 `AGENTS.md`（條目 512927523e）。`!` 另兩個（7c0479dc7f en.json、edddbe1b0a sonner.tsx）只有 context 變。`<`：d3acf4d1a6 照條目丟；23bc22afdf（上游 5dfaee07b1 的 cherry-pick）因 v1.4.242 已含而自動略過，跟上一次紀錄的預期相符；補翻譯的 c31fc67504 仍需要（v1.4.242 其他語系沒有 `fontKeyword*`）。
- 守它的測試（mutation 證據）：watch-path-index 整檔改回上游 → `× matches a folder-scoped diff tab by absolute path, not its repo-relative path`；autosave 改回 → `× matches a folder-owned diff tab across Windows separator and drive spellings`；fork-lint-run 換回舊版 → `fork-lint-run: EXCLUDED names check:path-literal-ratchet, which upstream lint no longer runs; drop it`；sonner offset 改回 → `× lifts toasts above registered bottom chrome…`；cherry-pick 還原 → `check:test-file-runners` 列出被刪的測試檔。build-computer-macos.mjs 與 AGENTS.md 用逐位元組證明（見下方搬過來的條目）。
- 額外 commit：2884c0778d（lint，條目 a25a5f1fa7）、91693e96bc（autosave Windows path key，條目 17621d5368）、f34b34a706（updater-nudge 預熱，fork 自身問題條目）；a6a4352e8a、dfb4a446e8 = cherry-pick 上游 main 的 f34c13ca1e（#33889）、ad2156c358（#34062），因為 v1.4.242 本身過不了 `check:test-file-runners`（乾淨 v1.4.242 worktree 一樣紅）；f34c13ca1e 的 pr.yml 衝突採 v1.4.242 那側，已寫成 known-resolutions 條目，下一次 rebase 要丟。
- 審查：A/B/C/Codex 第 1 輪全 ACCEPTABLE、0 BLOCKING，沒有修正輪。NON-BLOCKING 留待：Codex——`fork-lint-run.test.mjs` 沒跑真正的 CLI 入口（入口改回舊邏輯時單元測試仍綠，`fork-check-lint` 會紅），建議用假 pnpm 補 CLI 測試；A——`--build-system native` 已被 SwiftPM 標 deprecated，移除時要從 d3acf4d1a6／9179c28214 找回 `--show-bin-path`；B——`importer-sweep.txt` 用檔名比對，`types.ts`／`worktree.ts` 誤報多（review-bundle.sh 可改進）。
- C 找到的 seam 測試缺口（既有、不擋，當債務）：① `editor-autosave.ts:177` owner 檢查（已寫成 known-resolutions「待人判斷」條目）；② `CombinedDiffViewer.tsx:57`、`:69` 讀 store 時的 `gitWorktreeId`；③ `use-global-keybindings.ts:236` 的 `sourceControl.openGitGraph`（只有 e2e git-graph-full-view.spec.ts:124 守）；④ `src/preload/api/app-bridge.ts:37`、`src/main/ipc/app.ts:190` 的 App bundle replaced IPC 接線（`isBundleReplaced` 是 optional，tc 也抓不到）。
- **判準（之後每次 MANUAL 都會遇到）**：第 6 步「沒有一個落在 seam-upstream.diff 碰到的 seam 上」以 **seam** 為單位，不是檔案：seam-upstream.diff 本來就包含每個上游動過、fork 也改過的檔，用檔案判的話「不相關的既有缺口不擋」永遠是空的。判法：fork 的那幾行在 rebase 前後相同（`diff <(git diff vOLD OLD_DEVELOP -- f | grep '^[+-][^+-]') <(git diff vNEW HEAD -- f | …)`），而且上游在那個檔的 hunk 碰不到這個 seam 的判斷結果 → 既有缺口，列進通知。修正 commit 的 diff context 涵蓋那一行不算「落在修正的 hunk 上」，要看修正本身能不能改變那個條件的結果。上一次的 d809e41db0 是上游**改寫**了 seam 所在的函式本身，所以要補。
- 上游既有紅：v1.4.242 的 `check:test-file-runners`（上面已處理）；CI shard 3/8 `src/main/ai-vault/session-scanner-pi-omp-shared-root.test.ts > lists each transcript once under its writer when Pi scans the same folder for a workspace` 第 1 次紅、`rerun --failed` 綠（fork 沒碰 ai-vault，算偶發）。
- 使用者送上游的 PR stablyai/orca#6255（clear canonical worktree activeWorkspaceKey）已在 v1.4.242（015996d1b1）。fork 的 develop 沒有帶同一個改動，不用丟 commit；fork 上還留著 PR 分支 `fix/clear-active-workspace-on-worktree-delete`，沒動。之後使用者的上游 PR 被合併時，先 `git log vOLD..OLD_DEVELOP -- <PR 改的檔>` 看 develop 有沒有帶同樣的 commit，有就該丟（同 23bc22afdf 的模式）。
- 耗時（RUN 00:17:50Z 起，全部約 54 分）：rebase＋開 PR 8 分（00:18 → 00:26）；本機閘門 5 分（00:26 → 00:31，含 cherry-pick 修正輪約 2 分與 static 第 2 輪）；CI 27 分（run 00:31:34 → 00:58:30，第 1 次約 15 分，偶發紅重跑 shard 約 11 分）；盲審 11 分（00:32 → 00:43，跟 CI 並行）；發版 10 分（release run 01:00:40 → 01:10:46）。跟上一條（v1.4.241）比：CI 27 分超過 13 分的 1.5 倍，原因是上游偶發測試要重跑一個 shard（+11 分），第 1 次本身也比上次多 2 分；其他各段都比上一次短（rebase 18→8、盲審 15→11、發版 11→10）。
- 用掉的 `known-resolutions.md` 條目（5 條，都照做；b7fb07c379 那條 v1.4.242 不含、留著）：

### 512927523ee0e3eb0612b58ecc4f5f2c0d3e4121（#34008、Remove obsolete reference documentation）× fork 027c9824ce（docs(fork): read FORK.md before branching, pushing or opening a PR）、a896adf172（docs(fork): restore the CLAUDE.md import; red lines and overrides in versioned files）、05e3525d93（docs(fork): diagnose after the third review round; pin long checks）、a0c670fca6（docs(fork): 記錄 fork 的合併閘門、非 UI 測試策略與環境陷阱;fork-check 擋落後基準）— canary 2026-10-27
- 類型：兩邊各改各的
- 衝突檔：AGENTS.md（1 個 hunk，檔尾 `# Tests` 那行）
- 連帶症狀：無
- 處理：上游刪掉 `docs/reference/` 九份文件，並拿掉 AGENTS.md 裡指向它們的連結（fixtures、cross-platform-support、git-workflow、test-antipatterns 四處）。採上游 AGENTS.md 全文（`Avoid adding low-value tests…` 那行不帶 `[Anti-patterns](…)` 連結），檔尾空一行後補回 fork 的 `# Fork Maintenance` 整段（標題、說明段與三個項目，跟 develop 上的一字不改）。fork 的 FORK.md、`.claude/skills/**` 與其他 fork 檔都沒有連到那九份被刪的文件（canary 時 grep 過）。
- 守它的測試：`check:readme-local-links`（上游 lint 步驟）
- 驗證（2026-10-27，上游 b7fb07c379383d2bc6b17ca08f742ce855bd605a）：在 canary worktree 照做，上游 lint 的 34 步（LINT_STEPS 35 步扣掉 EXCLUDED 的 1 步）中 `check:readme-local-links` 通過；套好的檔在 `~/.cache/orca-fork-canary/20261026T213049Z-39380/resolution/files/AGENTS.md`。
- **這次（v1.4.242）**：照做（跟眼前相符）。但「守它的測試」寫錯：`check:readme-local-links` 只掃 README.md 與 docs/readme/*.md，不掃 AGENTS.md（把連結加回去仍綠）。這次改用逐位元組證明：AGENTS.md 在 `v1.4.241..舊 develop` 與 `v1.4.242..新 head` 的 fork 新增行完全相同、兩邊都沒刪上游行。之後 AGENTS.md 衝突都用這個證明。

### 8d18f318d7b32b6ffe779310d3a8bd7115b9afa0（#21146、fix(build): pin the native SwiftPM build system for the computer-use universal binary）× fork d3acf4d1a6（fix(build): computer-use 的各架構暫存檔移出 .build/release,舊版 SwiftPM 的 release symlink 不再藏掉 arm64）、9179c28214（build(fork): 新增個人 fork 的 macOS 發行打包,關閉上游自動更新）在這個檔的 hunk — canary 2026-10-27
- 類型：上游修了同一件事
- 衝突檔：config/scripts/build-computer-macos.mjs（1 個 hunk，`buildUniversalBinary` 的 map 內容）
- 連帶症狀：無
- 處理：兩邊都在解 SwiftPM 6.4 預設 swiftbuild 不寫 `.build/<triple>/release` 的問題；上游加 `--build-system native` 讓每個架構各自落在 `.build/<triple>/release`。採上游整個檔：丟掉 fork commit d3acf4d1a6（它只改這個檔），9179c28214 只丟它在這個檔的改動（`slicesDir`／`--show-bin-path` 複製切片，以及檔尾的 `capture()`，不丟會變死碼），9179c28214 的其他檔照留。之後上游拿掉 native build system（SwiftPM 已印 deprecated 警告）時，可能要把 fork 的 `--show-bin-path` 做法找回來（在 develop 的 9179c28214／d3acf4d1a6 裡）。
- 守它的測試：無單元測試；fork-release.yml 發版時會真的建 computer-use helper。
- 驗證（2026-10-27，上游 b7fb07c379383d2bc6b17ca08f742ce855bd605a）：在 canary worktree 用上游版從乾淨的 `.build` 跑 `node config/scripts/build-computer-macos.mjs`（本機 Swift 6.4）→ 成功，`lipo -archs` 對 `.build/release/orca-computer-use-macos` 與 `Orca Computer Use.app` 裡的執行檔都是 `x86_64 arm64`；有 `'--build-system native' has been deprecated` 警告。
- **這次（v1.4.242）**：照做：rebase -i 丟 d3acf4d1a6，9179c28214 在這個檔衝突時 `git checkout v1.4.242 -- config/scripts/build-computer-macos.mjs`；結果檔與 v1.4.242 逐位元組相同（證明就是 `git diff v1.4.242 HEAD -- <檔>` 為空）。

### 17621d5368e16a207063b7570e880c18480c0e32（#14812、fix(editor): match external file changes across Windows path spellings）× fork df6ae0f346（feat(source-control): folder workspace 多 repo 變更面板、ClipCode 複製與還原,移植到 v1.4.229）、ad18bc7c6d（fix(source-control): folder 分頁的 git/讀檔改由 filePath 推導 repo 相對路徑，還原時丟掉失效 git owner 會重算 relativePath）— canary 2026-10-27
- 類型：兩邊各改各的
- 衝突檔：src/renderer/src/components/editor/editor-external-watch-path-index.ts（1 個 hunk，`matchingOpenFiles` 的 `return collectMatchingFiles(…)`）
- 連帶症狀：失敗測試 src/renderer/src/components/editor/editor-external-watch-path-index.fork.test.ts（`matches a folder-scoped diff tab by absolute path…`，canary 把檔重設成上游版造成）
- 處理：採上游結構（`this.directKey = externalChangePathKeyFor(scope.worktreePath)`，direct editors 都經 `this.directKey`），加回 fork 的 folder-scoped diff：建索引時 `const scoped = file.gitWorktreeId && file.gitWorktreeId !== file.worktreeId`，以 `scoped ? this.directKey(file.filePath) : file.relativePath` 為 key；查詢時第三個參數是 `[...(this.diffsByRelativePath.get(change.relativePath) ?? []), ...(this.diffsByRelativePath.get(this.directKey(change.absolutePath)) ?? [])]`。上游這個 commit 的意圖是所有絕對路徑比對都折疊 Windows 拼法，fork 的 scoped diff 是第三個這種比對點，所以也包進 key；同理 editor-autosave.ts（沒衝突、自動合入）`getOpenFilesForExternalFileChange` 的 fork 那行 `? file.filePath === absolutePath` 改成 `? pathKey(file.filePath) === absolutePathKey`（用上游在同函式算好的 `pathKey`／`absolutePathKey`）。兩處各補一個 fork 測試（Windows 拼法 `c:\…` 對 `C:/…`）：editor-external-watch-path-index.fork.test.ts 的 `matches a folder-scoped diff tab across Windows separator and drive spellings`、editor-autosave.fork.test.ts 的 `matches a folder-owned diff tab across Windows separator and drive spellings`；內容在 `~/.cache/orca-fork-canary/20261026T213049Z-39380/resolution/files/` 與同目錄 `vs-fork-develop.patch`。
- 守它的測試：fork-seam-tests「Upstream component slots and folder routing」組（editor-external-watch-path-index.fork.test.ts、editor-autosave.fork.test.ts）；上游 editor-external-watch-path-index.test.ts
- 驗證（2026-10-27，上游 b7fb07c379383d2bc6b17ca08f742ce855bd605a）：照做後 watch-path-index 兩個測試檔 9 個測試、editor-autosave*／editor-external* 7 檔 47 個測試全過；改回 `scoped ? file.filePath` → 新 index 案例紅；改回 `file.filePath === absolutePath` → 新 autosave 案例紅；`pnpm tc` 只剩下面 b7fb07c379 那條上游的錯。
- **這次（v1.4.242）**：照做，直接複製 canary 的 resolution 檔（watch-path-index 在 df6ae0f346 衝突時整檔換上，後續 commit 沒再衝突）；editor-autosave.ts 與兩個 fork 測試是額外 commit 91693e96bc。mutation：整檔改回 v1.4.242 → 2 紅；查詢 key 改回 `change.absolutePath` → Windows 案例紅；autosave 改回 → autosave Windows 案例紅。

### a25a5f1fa7b8b765574b5571ffd1e33efbad2aaa（#33817、perf(devex): parallel pnpm lint (169s → 50s), capped typecheck threads, fresh shard timings）× fork f2f00f3cd9（ci(fork): run fork-check-lint's upstream steps from package.json）、34ab0221ec（chore(fork): name every lint failure at once and lint in the canary）— canary 2026-10-27
- 類型：上游改了 fork 依賴的 API
- 衝突檔：無
- 連帶症狀：失敗測試 config/scripts/fork-lint-run.test.mjs（`applies this checkout's exclusions to its lint script`）；報告的「Lint failures」只有 `fork-lint-run: EXCLUDED names check:path-literal-ratchet, which upstream lint no longer runs; drop it`，代表上游 lint 一步都沒在合併樹上跑過（`make fork-check-lint` 一樣會在第一行就紅）。
- 處理：上游 `pnpm lint` 改成 `node config/scripts/run-lint.mjs`，步驟清單在它 export 的 `LINT_STEPS`（`check:path-literal-ratchet` 仍在裡面，EXCLUDED 不用改），`resolveLintCommands(scripts, steps)` 給 `{ name, command }`；`oxlint`、`check:import-boundaries`、`lint:ast-grep-gates` 沒有 package script，是 run-lint.mjs 的 BARE_COMMANDS。fork-lint-run.mjs 改成：`import { LINT_STEPS, resolveLintCommands } from './run-lint.mjs'`；刪掉 `parseLintSteps`／`stepName`；`applyExclusions(steps)` 改以步驟名比對；新增 `lintStepArgs({ name, command }, scripts)`（有 package script → `['run', name]`，否則 `pnpmArgs(command)` → `pnpm exec …`，仍不走 shell）；`runLintSteps` 吃 `{ name, args }`，失敗訊息格式 `` fork-lint-run: `<name>` failed with exit code N `` 不變（fork-canary.sh 靠它解析）；入口 `resolveLintCommands(scripts, applyExclusions(LINT_STEPS)).map(…)`。fork-lint-run.test.mjs 跟著改（拿掉 parse 的兩個案例，加 `lintStepArgs` 案例，最後一個案例改讀 `LINT_STEPS`）。完整內容在 `~/.cache/orca-fork-canary/20261026T213049Z-39380/resolution/files/config/scripts/`。另外：`config/fork-upstream-api.txt` 登記 `config/scripts/run-lint.mjs LINT_STEPS` 與 `config/scripts/run-lint.mjs resolveLintCommands`；FORK.md 第 29 行「from `package.json`」改成「from run-lint.mjs's `LINT_STEPS`」，Makefile 第 216 行的註解同理。
- 守它的測試：config/scripts/fork-lint-run.test.mjs；`make fork-check-lint`
- 驗證（2026-10-27，上游 b7fb07c379383d2bc6b17ca08f742ce855bd605a）：fork-lint-run.test.mjs 6 個測試通過；在 canary worktree 實際跑 `node config/scripts/fork-lint-run.mjs`，34 步（35 扣 EXCLUDED 1）全跑完，只有 `oxlint` 紅（就是下面 b7fb07c379 那條上游的未使用 import），其他 33 步都過，沒有抓到 fork 的檔。
- **這次（v1.4.242）**：照做（額外 commit 2884c0778d）：canary 的 fork-lint-run.mjs／test 整檔換上，`config/fork-upstream-api.txt` 加兩個 pin，FORK.md 第 29 行與 Makefile 註解照改；另外 auto-rebase SKILL.md 第 1 步第 8 點的描述也改成讀 `LINT_STEPS`。在 v1.4.242 上 34 步全跑，只有 `check:test-file-runners` 紅（上游自己的，見本次紀錄）。

### fork 自身問題（updater-nudge.fork.test.ts 第一個案例在整套負載下逾時）× fork 597e91b727（refactor(fork): stop exporting upstream internals the fork reads）— canary 2026-10-27
- 類型：fork 自身問題
- 衝突檔：無
- 連帶症狀：失敗測試 src/main/updater/updater-nudge.fork.test.ts（`updater inner guards in a packaged fork distribution > never polls update campaigns`，`Test timed out in 30000ms`）。canary 本身那次這個案例跑 5.6 秒、過了；canary 後在合併樹重跑 172 檔時逾時。
- 處理：每個案例 `vi.resetModules()` 後 `await import('./updater-setup')`，第一次是冷的 transform（develop 上單獨跑這個案例 2.5～15 秒，後面的案例 ~90ms），整套平行跑時會超過 30 秒。在 `describe.each` 前加 `beforeAll(async () => { await import('./updater-setup') }, 120_000)`，import 加入 `beforeAll`，註解一行：`// Why: the first cold import of updater-setup takes seconds and passed the 30s test timeout under full-suite load.`。只改 fork 測試檔。
- 守它的測試：fork-seam-tests「Updater: fork distribution」組（updater-nudge.fork.test.ts）
- 驗證（2026-10-27，上游 b7fb07c379383d2bc6b17ca08f742ce855bd605a）：在 canary worktree 清掉 vite 快取後跑，4 個案例都過，第一個案例從秒級降到 40ms；`ast-grep-gates`（含 flaky-test-pattern ratchet）與 oxlint 對這個檔都過。負載下不再逾時這點沒法直接重現，未驗證。
- **這次（v1.4.242）**：照做（額外 commit f34b34a706，只改 fork 測試檔，免 mutation 證明）；本機 4/4 過，CI 綠。

## 2026-10-26 run 121 的流程修正 — PR #84（已合併）
- 無人值守的 pipeline 一律前景等待：Orca automation 看到 agent 結束這一輪就判 run 完成並可能關 terminal。長指令跑成 `<指令> > LOG 2>&1; echo $? > LOG.exit`，用 `config/scripts/fork-wait-for-job.sh` 分段等；**每個等待的 Bash 呼叫要傳 `timeout: 600000`**（預設 2 分鐘，超過一樣被移到背景）；CI 用 `gh-wait -t 9`、Codex 用 `codex-companion wait --timeout-ms 540000`；Claude 審查者改用 `claude -p` 子行程（Agent 工具只能在背景跑）。LOG 每輪換新名，舊的 `.exit` 會讓等待立刻結束。
- `fork-lint-run.mjs` 與 `make fork-check-lint` 跑完每一步再列出全部失敗；canary 在合併樹跑上游 lint（只報告），`canary-last.json` 多 `lintFailures`。
- auto-rebase 本機閘門改成 `make -k fork-check-static` 加 seams；整套單元測試、e2e、wire、mobile 只在 CI 跑；推上去就開盲審，跟 CI 同時跑；第 7 步推 main 後再停用一次上游 workflow。cherry-pick 的上游 lint 修正以「改回那一步 lint 會紅」為證明，翻譯另一個 commit（patch-id 才對得上上游）。
- 已處理的 `known-resolutions.md` 條目「fork 自身問題（seam 清單漏登錄 d809e41db0 新增的測試）」：`tab-bar-item-model.git-status.fork.test.ts` 登錄進「Upstream component slots and folder routing」組，條目已刪。
- 耗時基準（v1.4.241，12:17 → 14:57，共 2 小時 40 分，時間取自 PR #83 留言與 CI）：rebase＋開 PR 18 分；run 被殺到接手 48 分（含查原因約 35 分）；本機 fork-check 5 輪（每輪撞一個上游新檢查）＋整套單元測試 37 分；CI 與本機 e2e/wire/mobile 13 分；盲審第 1 輪 15 分；補測試＋CI＋第 2 輪 13 分；發版 11 分。PR #84 後的目標是 50～60 分：rebase ～10、static＋seams ～10、CI ∥ 盲審 ～15、修正輪（有的話）～13、發版 ～11。下一次 auto-rebase 寫它的處理紀錄時，照這個分段寫實際耗時；明顯超過就找出是哪一段、寫下原因。
- 這個 PR 的 CI 有一次 mobile job 卡住 17 分鐘（平常 4～5 分鐘），取消後 `rerun --failed` 5 分鐘綠；跟這次改動無關。

## 2026-10-26 auto-rebase v1.4.240 → v1.4.241（PR #83）— develop 已移動並發 v1.4.241-fork.1
- 結果：develop = main = d809e41db0（舊 develop 備份 `backup/develop-v1.4.240-20261026T041726Z`），release run 40281818581 綠，cask 1.4.241-fork.1；MacBook 上 Orca Fork 開著，沒自動升級。MANUAL：313 個 fork commit，range-diff 273 `=`、40 `!`、0 `<`，rerere 沒重放；衝突逐檔解法見 PR #83 說明。
- 中斷與接手：run 121 在 12:33 把第 3 輪 `make fork-check` 丟到背景、結束這一輪等通知 → Orca 的 `judgeIdleRun` 把 run 判成 completed → 12:35 Orca 以 operator_close 關掉 terminal，Claude 與背景 fork-check 一起被殺（task 輸出 `[killed]`）；兩個修正 commit 還沒推。使用者在互動 session 接手（RUN 沿用 20261026T041726Z）。**下一次要怎麼做**：無人值守 run 等長任務（fork-check、e2e、CI、Codex）一律在前景等（Bash timeout 上限 10 分鐘，超過就用 `gh-wait`／`codex-companion wait` 這類前景阻塞的指令，或把 make 拆段），不要結束這一輪等背景通知；否則 automation 會被判完成、terminal 可能被收掉。這該改進 skill（待人開 PR）。
- 上游新 ratchet 造成的修正（額外 commit）：
  - 8cb2458412 `check:e2e-typecheck-ratchet`：fork e2e helper `folder-multi-repo-layout-scenarios.ts:290` `'barBox' in bar1` → `bar1.barBox`。
  - 25aedee51f `check:flaky-test-pattern-ratchet`：19 個 fork 測試加進 `config/flaky-test-pattern-baseline.txt`，只插入、不重排上游行（排序會讓之後每次 rebase 衝突）。
  - 23bc22afdf：v1.4.241 本身過不了 `verify:localization-coverage`（`chat-appearance-search.ts`/`ChatFontFamilySetting.tsx` 的英文關鍵字；乾淨 vNEW worktree 一樣紅）。cherry-pick 上游 main 的修正 5dfaee07b1（#33715）；下一次 rebase 到含它的 release 時應以相同 patch 自動略過，沒略過就丟掉這個 commit。
  - c31fc67504：#33715 新增的 `settings.appearance.chat.fontKeyword{Typeface,Typography}` 補 6 個 locale 翻譯（fork-locale-parity 以 vNEW 為基底，會把它們算成 fork key）。上游之後自己翻譯時 locale driver 可能在這兩個字串留衝突標記：採上游文案。
  - 84a30d2418：`use-folder-repo-status-refresh.ts` 改走 `resolveWorktreeGitCopyNow` 傳 `ownerHostId`（條目 e03786fb90 照做）。
  - d809e41db0：審查者 C1 發現 v1.4.241 改寫的 `buildTabStripLayoutKey` 裡 fork 的 `getEditorTabGitStatusKey` 沒測試會紅（落在上游碰到的 seam → 不補就不算合格 MANUAL）。補 `tab-bar-item-model.git-status.fork.test.ts` 一個案例；改回 `item.data.relativePath` → `× re-keys the strip when a folder-workspace tab's own repo status changes`。
- 本機閘門的上游既有紅（雙邊輸出貼在 PR #83）：macOS 上 12 個上游測試檔（ci-managed-ssh-execution、dependency-security-release、main-entry-facade、pr-auxiliary-preflight-admission、process-host-dev-rebuild、verify-cli-bin、packaged-cli-assets、serve-sim-kill-contract、fish-xdg-data-dirs-handoff、orcad-forked-child-paths、worker-thread-child-process、RichMarkdownEditor.focus-leave）在 vNEW 一樣紅；`structured-permission-report-publication.unit.test.ts` 全量負載下 flake、單獨過；mobile `native-chat-visual-links › blocks popups…` 本機 vNEW 一樣紅（CI Linux 綠）；wire `qoder-history-search-downgrade` 高負載逾時、單獨過。這些下一次看到直接對照，不用重查。
- 審查：第 1 輪 A/B/C1/C2/Codex 全 ACCEPTABLE；第 2 輪（修正）Claude + Codex 同 thread ACCEPTABLE。NON-BLOCKING 留待：`use-git-history-commit-actions.ts` ~145 fork 拿掉上游 `openCommitFile` cache guard 沒測試；新測試沒登錄 seam 清單（已寫成 known-resolutions 條目）；`pty-agent-pane-launch.fork.test.ts` 留在 `src/main/ipc/`（上游 sibling 搬到 `pty/`）；fork git-history/graph 呼叫點仍用 `getConnectionId`（與上游 v1.4.241 自己的 history 一致）。
- 流程缺口：`make fork-ci-disable-upstream` 在第 6 步（移 develop 後）跑時，上游新加的 `wsl-orcad-e2e-frozen-runner-retry.yml` 還沒註冊（GitHub 依預設分支 main 註冊，main 第 7 步才推），停用不到；第 7 步推完 main 後重跑才停用。skill 應在第 7 步推 main 後再跑一次（待人開 PR）。
- 用掉的 `known-resolutions.md` 條目（三條都照做，跟眼前相符）：

### 0b28553093b872fb0013795ad334d6001da34967（#33450、feat(ssh): show saved port forwards that couldn't start…）× fork fa84af8c04、519950c24b 等 Git Graph 系列（Commits 區分支篩選、Git Graph 全螢幕分支樹）— canary 2026-10-25
- 類型：兩邊各改各的
- 衝突檔：src/renderer/src/i18n/locales/{en,es,fr,ja,ko,pt,zh}.json（每檔一個 hunk）
- 連帶症狀：無（typecheck 與 170 個 fork 測試檔在上游側的 locale 下也全過，所以只有衝突，沒有其他症狀）
- 處理：上游在 `auto.components.right.sidebar` 尾端新增 `ssh.unrestored.port.row`（3 個 key），fork 在同一處新增 Git Graph 的字串（`GitHistoryGraph` 等）。兩邊都只新增 key，沒有重疊、也沒有刪除。照 FORK.md 兩邊都留，但**不要直接手改衝突標記**：上游那段結尾停在還沒關的 `ssh` 物件裡，兩段直接接起來會變成不合法的 JSON。改用 JSON deep merge：以上游（ours）檔為底，依序補上 fork（theirs）有、上游沒有的 key，用 `json.dumps(…, ensure_ascii=False, indent=2) + "\n"` 輸出（上游檔用這個格式重新輸出，與原檔逐位元組相同）。key 有重疊時值必須相同，不同就停下來。
- 守它的測試：`pnpm run verify:localization-catalogs`、`node config/scripts/fork-locale-parity.mjs <基底>`（`make fork-check-lint`）。注意：canary 對上游 main 試合時，FORK_BASE 還是舊 tag，上游 main 新加、只放進 en.json 的 key（像 #33260 的 `auto.store.slices.worktrees.localBaseRef*`，14 個）會被誤算成 fork key，報 6 個 locale 各缺 14 個；改用上游 main 當基底就通過。auto-rebase 時基底是 vNEW，不會有這個誤報。
- 驗證（2026-10-25，上游 aa08c84f3b8cb6bbdd62db1d803ba8b3e7973fda）：在 canary worktree 依上述 deep merge 合好 7 檔 → `verify:localization-catalogs` 通過（17550 個 key 參照）；`fork-locale-parity.mjs HEAD`（上游 main 當基底）通過，fork 的 174 個 key 7 個 locale 都有；`pnpm tc` 通過；canary 那 170 個測試檔 963 個測試全過。

### 7d6603aa1766eb4cac079f8d6d2f4e67f251574a（#33249、[comment audit] Complete repository-wide comment cleanup）× fork 多個 commit（ec28156735 folder workspace 多 repo 變更面板、ClipCode 複製與還原,移植到 v1.4.229；86336a5e53 feat(diff): step into the next file at the last change, IntelliJ-style；3e56c694ff Git Graph 改成編輯器分頁…；78293141ea fix(source-control): keep toasts above the bulk action bar；fb0b3d9c4b folder 裡的 repo 可以只在 folder 顯示…；b5a3905d53 refactor(source-control): move the fork's commit menu entries into a slot 等，報告逐檔列出）— canary 2026-10-26
- 類型：兩邊各改各的（上游只改寫或刪掉註解，fork 改程式碼）
- 衝突檔（19）：src/main/project-groups/nested-repo-discovery.ts、src/renderer/src/assets/main.css、src/renderer/src/components/editor/{EditorPanel.tsx,diff-navigation-context.tsx,restored-editor-same-workspace-reown.test.tsx}、src/renderer/src/components/right-sidebar/source-control/commit/{source-control-entry-failure-toast.ts,use-discard-confirmation.ts,use-entry-mutations.ts}、…/source-control/panel/{panel-content.tsx,panel.tsx,use-worktree-operation-state.ts}、…/source-control/sync/{git-history-commit-files.tsx,use-git-history-commit-actions.ts}、src/renderer/src/components/tab-bar/EditorFileTab.tsx、src/renderer/src/components/ui/sonner.tsx、src/renderer/src/lib/{remap-open-editor-tabs-for-path-change.ts,workspace-session-hydration-keys.ts}、src/renderer/src/store/slices/editor/actions/open-conflict-review.ts、src/renderer/src/store/slices/editor/types/open-file.ts（共 26 個 hunk）
- 連帶症狀：canary 把衝突檔重設成上游版後，`open-file.ts` 少了 `gitWorktreeId`／`gitGraph`、`diff-navigation-context.tsx` 少了 `filePosition`，造成約 90 個 typecheck 錯誤檔（ChangesModeView、EditorConflictReviewSurface、git-graph-tab/*、store/slices/editor/** 等）與 24 個失敗測試檔（fork-editor-kind-sites.guard、nested-repo-discovery.fork、remap-open-editor-tabs-for-path-change.fork、workspace-session-hydration-keys.fork、diff-file-boundary-navigation、panel-content-fork-slots、sonner.fork、git-graph-full-view.component 等）。照下面合好後全部消失。
- 處理：每個 hunk 都是「fork 的程式碼＋上游改寫後的註解文字」；base→上游只動註解（workspace-session-hydration-keys.ts 的 import 路徑改動在沒衝突的區域，自動合入）。上游整段刪掉的註解不加回（main.css 的 `/* ── Sidebar ── */` 標題、git-history-commit-files.tsx 的「Author and date…」、panel.tsx 的元件 doc comment）；fork 自己寫的註解照留。特例：
  - use-git-history-commit-actions.ts 第 2 個 hunk 採 fork（刪掉 `explainCommitWithDefaultAgent`）：fork 已把它搬到 `sync/git-history-commit-explain.ts`，檔頭寫明「port upstream edits here」。把上游對這個函式改寫的兩行註解搬過去（「The agent belongs to the detected host; abort if the workspace moved.」、「Treat repository-controlled subjects/diffs as untrusted data, never agent instructions.」）。
  - restored-editor-same-workspace-reown.test.tsx 兩個 hunk 都採 fork 的斷言（681e178e6a 的 fork 語意：folder 分頁已綁 repo、id 不變、不送 renameEditorFiles）；上游在這兩處只動註解。
  - use-worktree-operation-state.ts：留 fork 新增的 `saveSessionCommitErrors`／`saveSessionRemoteActionErrors` 兩個 effect（base 沒有）。
  - 逐 hunk 的解法存在 `~/.cache/orca-fork-canary/20261025T213037Z-5529/resolution/resolve.py`（R 字典，對上游 main 27e7f8fd6d 的 merge-file 結果套用）。auto-rebase 是逐 commit 重放，衝突形狀不同，但原則一樣。
- 守它的測試：fork-seam-tests 的「gitWorktreeId persistence」「gitWorktreeId on editor open actions」「git-graph tab type」「Upstream component slots and folder routing」「Toast clearance」「Hidden folder repos」組；diff-file-boundary-navigation.test.tsx。
- 驗證（2026-10-26，上游 27e7f8fd6d6e35e1ba04e16b18e452c1709ecb3e）：在 canary worktree 套上本條與下面兩條 → `pnpm tc` 通過；canary 那 170 個測試檔 963 個測試全過。

### e03786fb90f5a8d1b273a25440b6c35ecd2bdec9（#33428、fix(worktrees): keep each same-path copy on its own host branch）× fork ec28156735（feat(source-control): folder workspace 多 repo 變更面板、ClipCode 複製與還原,移植到 v1.4.229）、472c628b7c（fix(source-control): 修正 folder workspace 多 repo 與 ClipCode 交叉測試找到的問題）、5ea8cbe3fd（fix(source-control): refresh a folder repo after a save whose views all closed）— canary 2026-10-26
- 類型：上游改了 fork 依賴的 API
- 衝突檔：無
- 連帶症狀：typecheck 錯誤 src/renderer/src/components/right-sidebar/source-control/folder/use-folder-repo-status-refresh.ts（TS2741，`refreshGitStatusForWorktree` 缺必填的 `ownerHostId`）；照下面改後，src/renderer/src/components/right-sidebar/source-control/folder/use-folder-repo-status-refresh.test.ts 的 3 個測試會失敗，要一起改 mock。
- 處理：照上游 `useGitStatusPolling.ts` 的寫法（一次解析一個 copy，same-path twin 不會拿到別台的 transport）。`refreshOne` 裡把 `getConnectionId(worktree.id)`＋`getWorktreeGitOwnerTarget(worktree.id)` 換成 `const copy = resolveWorktreeGitCopyNow(worktree.id)`（`@/lib/worktree-git-copy`），`if (!copy) return`，`const { connectionId, transport: target } = copy`，呼叫時加 `ownerHostId: copy.hostId`；拿掉兩個不再用的 import。測試把 `../../worktree-git-owner-target` 與 `@/lib/connection-context` 兩個 mock 換成 `vi.mock('@/lib/worktree-git-copy', () => ({ resolveWorktreeGitCopyNow: (id) => ({ worktreeId: id, hostId: null, connectionId: id.includes('ssh') ? 't1' : undefined, transport: ownerEnvironmentId ? { kind: 'environment', environmentId: ownerEnvironmentId } : { kind: 'local' } }) }))`。
- 守它的測試：use-folder-repo-status-refresh.test.ts、folder-multi-repo-panel.test.tsx
- 驗證（2026-10-26，上游 27e7f8fd6d6e35e1ba04e16b18e452c1709ecb3e）：同上一條（tc 通過、170 檔 963 測試全過，含改過的 use-folder-repo-status-refresh.test.ts）。

## 2026-10-26 所有改動都走同一個 PR 流程 — PR #80（已合併）
- 文件不再直推 develop：每個改動都開 PR，等同一個「Fork PR checks passed」。跑多少由 CI 的 `scope` job 決定（`config/scripts/fork-pr-scope.mjs`），agent 不選流程：全部是文件 → 重的 job 跳過，約一分鐘；其他路徑或空清單 → 全套；`scope` 失敗 → PR 被擋，重跑。
- 文件的定義沿用上游 `isDocsOnlyPath` 加 FORK.md；`.claude/`、`.github/workflows/`、`config/`、`src/`、`mobile/`、`docs/site/`、build 檔永遠跑全套。`verify` 只在 `scope` 成功且判 `docs` 時接受被跳過的 job（`fork-pr-gate-needs.mjs` 固定這段腳本）。
- 審查抓到的雷：只改文件的 PR 會跳過 `pnpm lint` 的 README 連結檢查，壞連結合進去後之後每個 PR 都紅，所以 `scope` job 自己跑這項檢查；`docs/site/package.json` 被 lint 讀，不能算文件。
- 使用者決定（PR #81）：develop 刻意不設 branch protection，因為 auto-rebase 要用 lease force-push develop；「文件也走 PR」由 FORK.md 與流程維持。只改文件的合併 commit 要發版時，沿 `git log --first-parent` 找到最近一個不是只改文件的合併（有跑建置且綠的 feat 合併，或 auto-rebase 的 head），以它的檢查為準。
- 快速路徑第一次實測（PR #81）：整個 run 29 秒，`scope` 判 docs、README 連結檢查有跑、六個重的 job 都 skipped、「Fork PR checks passed」綠。

## 2026-10-26 precheck 情境測試、發 v1.4.240-fork.4 — PR #79（已合併）
- `.claude/skills/orca-fork-auto-rebase/scripts/precheck.test.sh` 已掛進 `make fork-check-lint`（CI 的 static job 會跑）：假的 git、gh 與警報腳本，一種鎖狀態一個情境。改 precheck 時在這裡加情境；拿掉 develop-moved 判斷或改警報門檻都會讓它紅。precheck 的日期解析 BSD／GNU 都能用，所以 Linux CI 也跑得起來。
- 用假 HOME 測腳本時要 `env -u BASH_ENV`：這台機器的 BASH_ENV 會依假 HOME 重排 PATH，讓真的 gh 排到假的前面，不報錯、直接打到 GitHub。
- v1.4.240-fork.4（develop 73e8a87）：app 跟 fork.3 相同，只有流程與測試改動；release run 一次全綠，下載 dmg 驗過 Developer ID 簽章、hardened runtime、stapler、`spctl` 都正確。這次沒動簽章流程，PR 上的 dmg 仍然不走公證，簽章相關的改動要靠 dryrun tag 或正式發版驗。
- FORK.md「Unattended merges」補上「fork 自身問題」只改 fork 測試檔的修正免 mutation 證明（之前只寫在 skill，跟 FORK.md 的規則互相矛盾）。

## 2026-10-26 /code-review 對 PR #77 的兩輪審查 — PR #78（已合併）
- auto-rebase SKILL.md：「第 N 步」一律指 `## N.` 那節，節內項目叫「第 N 點」；以前「跳到第 8 步」可能被讀成第 1 步第 8 點（lint），跳過開 PR 與 needs-human。之後改 skill 時維持這個寫法。
- PR 留言標記（`<!-- auto-rebase:… -->`）一律放在留言第一行最前面，兩個 precheck 都用 jq `startswith` 只認開頭。
- precheck：網路或 GitHub API 失敗先安靜跳過，連續 6 小時以上才警報（計時檔 `~/.cache/fork-automation/orca-rebase-precheck-down-since`，任何一次沒失敗就清掉；precheck-alert 同訊息一天一次）。上游 release tag 格式怪異刻意不警報，等上游下一版。
- 刻意保留：「fork 自身問題」只改 fork 測試檔的修正免 mutation 證明，否則每條不穩測試的建議都會讓 develop 無法自動移動。
- pty-connection-test-environment.test.ts 第一個 case 改成 50ms timer、等 120ms：restore 超過 50ms 時 setTimeout 那半仍會沒檢查到，是測試本身的限制，不是回歸。

## 2026-10-26 人工審查 10-25～10-26 的 64 個 fork commit（PR #65～#76）— PR #77（已合併）
- 結論：develop 的產品程式碼沒有找到行為退化（20 個重構 commit 審過；`check:code-quality:changed v1.4.240`、`make fork-check-seams` 78 檔 466 測試、`pnpm tc` 都過）。問題都在自動化流程，PR #77 修掉。
- 已處理的 `known-resolutions.md` 條目「27e7f8fd6d…× fork 31e98b4203、34c38f14ac — canary 2026-10-26」（pty-connection-test-environment.test.ts 第一個 case 5ms timer 在負載下 restore 前就觸發）：照條目改，第一個 case 也加 `restored` 判斷，只算 restore 之後的觸發。把 `clearTrackedRealTimers()` 拿掉兩個 case 都紅。條目已刪。再看到這個測試不穩，先查這個 case 有沒有被改回去。
- canary 2026-10-26 的通知說前一天 7 個 locale 衝突「消失了」：實際是 05:28 另一個 session 開發 PR #76 時把 locale merge driver 裝成整個 clone 共用，canary 05:30 用到了它。沒有 driver 是 26 個衝突、有 driver 是 19 個。之後 canary 與 auto-rebase 都自己裝 driver（`config/scripts/fork-merge-driver-install.mjs`），衝突數以有 driver 為準；比對衝突數的變化時，先確認兩次都有 driver。
- 自動化流程的修正（PR #77）：auto-rebase 移動 develop 後保留 PR 與鎖到發版結束（`develop-moved` 留言，死掉會接著發）；PR 在 rebase 完就開（第 2 步有心跳）；verified／needs-human 的鎖遇到更新的上游 release 會自動收；每次 run 寫這份紀錄；「fork 自身問題」條目由下一次 rebase 照做；precheck 遇到 GitHub API 失敗或怪的 release tag 安靜跳過；`fork-notes.sh` 把「push 其實成功」當成成功。
- 留著不修、已知的小事：PR 上的 dmg 是 ad-hoc 簽，沒有 hardened runtime、team-id 檢查與公證（只有 `fork-release-dryrun-*` tag 會走到，發版前改到簽章或 entitlements 就推一個 dryrun tag）；locale driver 在 Windows 上路徑大小寫不同時可能退回 ours（只在 macOS／Linux 跑）；`terminal-host-file-link-miss-expiry.test.ts` 在 275814454b 刪掉後，host 端檔案連結「不存在」快取過期重查只剩上游快取測試間接覆蓋，那段行為改壞時要補回專屬測試。
