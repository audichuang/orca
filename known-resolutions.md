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

## 512927523ee0e3eb0612b58ecc4f5f2c0d3e4121（#34008、Remove obsolete reference documentation）× fork 027c9824ce（docs(fork): read FORK.md before branching, pushing or opening a PR）、a896adf172（docs(fork): restore the CLAUDE.md import; red lines and overrides in versioned files）、05e3525d93（docs(fork): diagnose after the third review round; pin long checks）、a0c670fca6（docs(fork): 記錄 fork 的合併閘門、非 UI 測試策略與環境陷阱;fork-check 擋落後基準）— canary 2026-10-27
- 類型：兩邊各改各的
- 衝突檔：AGENTS.md（1 個 hunk，檔尾 `# Tests` 那行）
- 連帶症狀：無
- 處理：上游刪掉 `docs/reference/` 九份文件，並拿掉 AGENTS.md 裡指向它們的連結（fixtures、cross-platform-support、git-workflow、test-antipatterns 四處）。採上游 AGENTS.md 全文（`Avoid adding low-value tests…` 那行不帶 `[Anti-patterns](…)` 連結），檔尾空一行後補回 fork 的 `# Fork Maintenance` 整段（標題、說明段與三個項目，跟 develop 上的一字不改）。fork 的 FORK.md、`.claude/skills/**` 與其他 fork 檔都沒有連到那九份被刪的文件（canary 時 grep 過）。
- 守它的測試：`check:readme-local-links`（上游 lint 步驟）
- 驗證（2026-10-27，上游 b7fb07c379383d2bc6b17ca08f742ce855bd605a）：在 canary worktree 照做，上游 lint 的 34 步（LINT_STEPS 35 步扣掉 EXCLUDED 的 1 步）中 `check:readme-local-links` 通過；套好的檔在 `~/.cache/orca-fork-canary/20261026T213049Z-39380/resolution/files/AGENTS.md`。

## 8d18f318d7b32b6ffe779310d3a8bd7115b9afa0（#21146、fix(build): pin the native SwiftPM build system for the computer-use universal binary）× fork d3acf4d1a6（fix(build): computer-use 的各架構暫存檔移出 .build/release,舊版 SwiftPM 的 release symlink 不再藏掉 arm64）、9179c28214（build(fork): 新增個人 fork 的 macOS 發行打包,關閉上游自動更新）在這個檔的 hunk — canary 2026-10-27
- 類型：上游修了同一件事
- 衝突檔：config/scripts/build-computer-macos.mjs（1 個 hunk，`buildUniversalBinary` 的 map 內容）
- 連帶症狀：無
- 處理：兩邊都在解 SwiftPM 6.4 預設 swiftbuild 不寫 `.build/<triple>/release` 的問題；上游加 `--build-system native` 讓每個架構各自落在 `.build/<triple>/release`。採上游整個檔：丟掉 fork commit d3acf4d1a6（它只改這個檔），9179c28214 只丟它在這個檔的改動（`slicesDir`／`--show-bin-path` 複製切片，以及檔尾的 `capture()`，不丟會變死碼），9179c28214 的其他檔照留。之後上游拿掉 native build system（SwiftPM 已印 deprecated 警告）時，可能要把 fork 的 `--show-bin-path` 做法找回來（在 develop 的 9179c28214／d3acf4d1a6 裡）。
- 守它的測試：無單元測試；fork-release.yml 發版時會真的建 computer-use helper。
- 驗證（2026-10-27，上游 b7fb07c379383d2bc6b17ca08f742ce855bd605a）：在 canary worktree 用上游版從乾淨的 `.build` 跑 `node config/scripts/build-computer-macos.mjs`（本機 Swift 6.4）→ 成功，`lipo -archs` 對 `.build/release/orca-computer-use-macos` 與 `Orca Computer Use.app` 裡的執行檔都是 `x86_64 arm64`；有 `'--build-system native' has been deprecated` 警告。

## 17621d5368e16a207063b7570e880c18480c0e32（#14812、fix(editor): match external file changes across Windows path spellings）× fork df6ae0f346（feat(source-control): folder workspace 多 repo 變更面板、ClipCode 複製與還原,移植到 v1.4.229）、ad18bc7c6d（fix(source-control): folder 分頁的 git/讀檔改由 filePath 推導 repo 相對路徑，還原時丟掉失效 git owner 會重算 relativePath）— canary 2026-10-27
- 類型：兩邊各改各的
- 衝突檔：src/renderer/src/components/editor/editor-external-watch-path-index.ts（1 個 hunk，`matchingOpenFiles` 的 `return collectMatchingFiles(…)`）
- 連帶症狀：失敗測試 src/renderer/src/components/editor/editor-external-watch-path-index.fork.test.ts（`matches a folder-scoped diff tab by absolute path…`，canary 把檔重設成上游版造成）
- 處理：採上游結構（`this.directKey = externalChangePathKeyFor(scope.worktreePath)`，direct editors 都經 `this.directKey`），加回 fork 的 folder-scoped diff：建索引時 `const scoped = file.gitWorktreeId && file.gitWorktreeId !== file.worktreeId`，以 `scoped ? this.directKey(file.filePath) : file.relativePath` 為 key；查詢時第三個參數是 `[...(this.diffsByRelativePath.get(change.relativePath) ?? []), ...(this.diffsByRelativePath.get(this.directKey(change.absolutePath)) ?? [])]`。上游這個 commit 的意圖是所有絕對路徑比對都折疊 Windows 拼法，fork 的 scoped diff 是第三個這種比對點，所以也包進 key；同理 editor-autosave.ts（沒衝突、自動合入）`getOpenFilesForExternalFileChange` 的 fork 那行 `? file.filePath === absolutePath` 改成 `? pathKey(file.filePath) === absolutePathKey`（用上游在同函式算好的 `pathKey`／`absolutePathKey`）。兩處各補一個 fork 測試（Windows 拼法 `c:\…` 對 `C:/…`）：editor-external-watch-path-index.fork.test.ts 的 `matches a folder-scoped diff tab across Windows separator and drive spellings`、editor-autosave.fork.test.ts 的 `matches a folder-owned diff tab across Windows separator and drive spellings`；內容在 `~/.cache/orca-fork-canary/20261026T213049Z-39380/resolution/files/` 與同目錄 `vs-fork-develop.patch`。
- 守它的測試：fork-seam-tests「Upstream component slots and folder routing」組（editor-external-watch-path-index.fork.test.ts、editor-autosave.fork.test.ts）；上游 editor-external-watch-path-index.test.ts
- 驗證（2026-10-27，上游 b7fb07c379383d2bc6b17ca08f742ce855bd605a）：照做後 watch-path-index 兩個測試檔 9 個測試、editor-autosave*／editor-external* 7 檔 47 個測試全過；改回 `scoped ? file.filePath` → 新 index 案例紅；改回 `file.filePath === absolutePath` → 新 autosave 案例紅；`pnpm tc` 只剩下面 b7fb07c379 那條上游的錯。

## a25a5f1fa7b8b765574b5571ffd1e33efbad2aaa（#33817、perf(devex): parallel pnpm lint (169s → 50s), capped typecheck threads, fresh shard timings）× fork f2f00f3cd9（ci(fork): run fork-check-lint's upstream steps from package.json）、34ab0221ec（chore(fork): name every lint failure at once and lint in the canary）— canary 2026-10-27
- 類型：上游改了 fork 依賴的 API
- 衝突檔：無
- 連帶症狀：失敗測試 config/scripts/fork-lint-run.test.mjs（`applies this checkout's exclusions to its lint script`）；報告的「Lint failures」只有 `fork-lint-run: EXCLUDED names check:path-literal-ratchet, which upstream lint no longer runs; drop it`，代表上游 lint 一步都沒在合併樹上跑過（`make fork-check-lint` 一樣會在第一行就紅）。
- 處理：上游 `pnpm lint` 改成 `node config/scripts/run-lint.mjs`，步驟清單在它 export 的 `LINT_STEPS`（`check:path-literal-ratchet` 仍在裡面，EXCLUDED 不用改），`resolveLintCommands(scripts, steps)` 給 `{ name, command }`；`oxlint`、`check:import-boundaries`、`lint:ast-grep-gates` 沒有 package script，是 run-lint.mjs 的 BARE_COMMANDS。fork-lint-run.mjs 改成：`import { LINT_STEPS, resolveLintCommands } from './run-lint.mjs'`；刪掉 `parseLintSteps`／`stepName`；`applyExclusions(steps)` 改以步驟名比對；新增 `lintStepArgs({ name, command }, scripts)`（有 package script → `['run', name]`，否則 `pnpmArgs(command)` → `pnpm exec …`，仍不走 shell）；`runLintSteps` 吃 `{ name, args }`，失敗訊息格式 `` fork-lint-run: `<name>` failed with exit code N `` 不變（fork-canary.sh 靠它解析）；入口 `resolveLintCommands(scripts, applyExclusions(LINT_STEPS)).map(…)`。fork-lint-run.test.mjs 跟著改（拿掉 parse 的兩個案例，加 `lintStepArgs` 案例，最後一個案例改讀 `LINT_STEPS`）。完整內容在 `~/.cache/orca-fork-canary/20261026T213049Z-39380/resolution/files/config/scripts/`。另外：`config/fork-upstream-api.txt` 登記 `config/scripts/run-lint.mjs LINT_STEPS` 與 `config/scripts/run-lint.mjs resolveLintCommands`；FORK.md 第 29 行「from `package.json`」改成「from run-lint.mjs's `LINT_STEPS`」，Makefile 第 216 行的註解同理。
- 守它的測試：config/scripts/fork-lint-run.test.mjs；`make fork-check-lint`
- 驗證（2026-10-27，上游 b7fb07c379383d2bc6b17ca08f742ce855bd605a）：fork-lint-run.test.mjs 6 個測試通過；在 canary worktree 實際跑 `node config/scripts/fork-lint-run.mjs`，34 步（35 扣 EXCLUDED 1）全跑完，只有 `oxlint` 紅（就是下面 b7fb07c379 那條上游的未使用 import），其他 33 步都過，沒有抓到 fork 的檔。

## b7fb07c379383d2bc6b17ca08f742ce855bd605a（#34072、fix(ci): unblock main: split over-long files and pin scanner test file times）× 無 fork commit — canary 2026-10-27
- 類型：上游自己就紅（fork 沒碰 `src/renderer/src/components/native-chat/`）
- 衝突檔：無
- 連帶症狀：typecheck 錯誤 src/renderer/src/components/native-chat/use-native-chat-context-menu.tsx（TS6133 `'StructuredChatPaneMenuItems' is declared but its value is never read`，第 33 行）；上游 lint 的 `oxlint` 步驟紅（同一行，`eslint(no-unused-vars)`）。
- 處理：#34072 把 JSX 換成 `NativeChatStructuredPaneMenuItems`，留下舊的 import。canary 時上游 main（到 2e67ba5a64）還沒修。auto-rebase 時：vNEW 不含 b7fb07c379 → 不適用；含而且乾淨的 vNEW worktree 一樣紅 → 在上游 main 找刪掉這行 import 的 commit cherry-pick（`git log vNEW..origin/main -- src/renderer/src/components/native-chat/use-native-chat-context-menu.tsx`）；還沒有就加一個只刪這行 import 的 fork commit，下一次 rebase 到含上游修正的 release 時丟掉它（同 23bc22afdf 的前例）。
- 守它的測試：`pnpm tc`、上游 lint 的 `oxlint`
- 驗證（2026-10-27，上游 b7fb07c379383d2bc6b17ca08f742ce855bd605a）：套上其他條目後 `pnpm tc` 只剩這一個錯；`git show origin/main:<檔>` 裡 `StructuredChatPaneMenuItems` 只出現在 import 那一行。

## fork 自身問題（updater-nudge.fork.test.ts 第一個案例在整套負載下逾時）× fork 597e91b727（refactor(fork): stop exporting upstream internals the fork reads）— canary 2026-10-27
- 類型：fork 自身問題
- 衝突檔：無
- 連帶症狀：失敗測試 src/main/updater/updater-nudge.fork.test.ts（`updater inner guards in a packaged fork distribution > never polls update campaigns`，`Test timed out in 30000ms`）。canary 本身那次這個案例跑 5.6 秒、過了；canary 後在合併樹重跑 172 檔時逾時。
- 處理：每個案例 `vi.resetModules()` 後 `await import('./updater-setup')`，第一次是冷的 transform（develop 上單獨跑這個案例 2.5～15 秒，後面的案例 ~90ms），整套平行跑時會超過 30 秒。在 `describe.each` 前加 `beforeAll(async () => { await import('./updater-setup') }, 120_000)`，import 加入 `beforeAll`，註解一行：`// Why: the first cold import of updater-setup takes seconds and passed the 30s test timeout under full-suite load.`。只改 fork 測試檔。
- 守它的測試：fork-seam-tests「Updater: fork distribution」組（updater-nudge.fork.test.ts）
- 驗證（2026-10-27，上游 b7fb07c379383d2bc6b17ca08f742ce855bd605a）：在 canary worktree 清掉 vite 快取後跑，4 個案例都過，第一個案例從秒級降到 40ms；`ast-grep-gates`（含 flaky-test-pattern ratchet）與 oxlint 對這個檔都過。負載下不再逾時這點沒法直接重現，未驗證。
