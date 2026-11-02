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

## fork 自身問題（上游 v1.4.246 改過的檔上，fork 接線沒有測試會紅）× fork 既有 folder workspace／diff 導覽／Git Graph 接線 — auto-rebase 2026-11-02
- 類型：fork 自身問題
- 衝突檔：無
- 連帶症狀：無（v1.4.246 rebase 審查者 C r1 實測：拿掉接線後整份 seam 清單全綠），但它們擋下了 v1.4.246 的自動移動（SKILL 第 6 步）。
- 處理：各補一個拿掉接線會紅的測試，加進 config/fork-seam-tests.txt：
  - `src/renderer/src/components/editor/EditorPanelHeader.tsx:230` 的 `{filePosition && <DiffFileSequenceStatus …/>}`：有 file list 的 diff 分頁要畫出序號／邊界提示（拿掉那段會紅）。
  - `src/renderer/src/components/editor/EditorPanel.tsx:72` 起的 `activeGitWorktreeId`：folder 分頁的 status／branch entries 要從 repo（`getOpenFileGitWorktreeId`）讀（改回 `activeWorktreeId` 會紅）。
  - `src/renderer/src/components/right-sidebar/source-control/panel/header-toolbar.tsx:248` 的 `<RepoWorkspaceGitGraphButton />`：工具列要有 Git Graph 按鈕（拿掉會紅）。
  - `src/renderer/src/components/editor/EditorEditFileSurface.tsx` 外層 `flex min-h-0 flex-1 flex-col`：ChangesModeView 用 flex-1 撐高，block 父層會讓 diff 0 高度；只有 e2e／幾何斷言看得到。
- 守它的測試：待補
- 驗證：未驗證（只有 C r1 的 mutation 結果，見 PR #109 審查留言）

## baeedad2038455cc21ed58e02e107315aa1f6692（#36828、feat(themes): ship GitHub and VS Code themes…）× fork 6efe38867a（fix(rebase): drop runtime catalog entries v1.4.246 no longer requires (upstream baeedad203)）— auto-rebase 2026-11-02
- 類型：上游自己就紅（v1.4.246 的 `verify:localization-catalogs`：`en-runtime-required.json no longer covers en.json`，`usageLimitActions`、`resumeInNewChat`）
- 衝突檔：無
- 連帶症狀：無
- 處理：fork 只帶上游 main baeedad203 對 `src/renderer/src/i18n/en-runtime-required.json` 的 hunk（刪 20 行，與 `pnpm run sync:localization-runtime-catalog` 結果相同），訊息有 `(cherry picked from commit …)`。patch-id 與上游不同，**不會自動略過**。適用條件 `git merge-base --is-ancestor baeedad2038455cc21ed58e02e107315aa1f6692 vNEW`：成立就照第 1 步「丟 commit」用標題 `fix(rebase): drop runtime catalog entries v1.4.246 no longer requires (upstream baeedad203)` 在 `vOLD..OLD_DEVELOP` 找到它丟掉。
- 守它的測試：上游 lint 的 `verify:localization-catalogs`
- 驗證（2026-11-02，v1.4.246）：沒有這個 commit exit 1，有則 exit 0。

## 0509a2d83a78b95c334290b90ee824307e9b157e（#37235、refactor: group local PTY provider and shell readiness modules）× fork 6177bf4a53（fix(rebase): point UNIT_EXCLUDE at the zsh test path v1.4.246's pr.yml runs (upstream 0509a2d83a)）— auto-rebase 2026-11-02
- 類型：上游自己就紅（v1.4.246 的 `check:test-file-runners`：pr.yml 從 main 同步、跑 `src/main/providers/local-pty/local-pty-shell-ready-zsh-launch-environment.test.ts`，tag 的 `UNIT_EXCLUDE` 還是上一層的舊路徑）
- 衝突檔：無
- 連帶症狀：`check:path-literal-ratchet`（fork lint 排除）多一條同路徑
- 處理：fork 只帶 0509a2d83a 對 `config/scripts/ci-unit-files.mjs` 的那一行（與上游逐字相同），測試留在舊路徑、由一般 unit shard 收。整個 cherry-pick 不行（3 檔衝突、依賴 vNEW 沒有的 `pty-master-foreground-observation`、`wsl-availability`）；只搬測試檔也不行（`fork-test-inventory` 用 `--no-renames`，會當成 fork 新增又被排除的測試）。rebase 到含 0509a2d83a 的 release 時這個 hunk 應該套上後為空、被 `--empty=drop` 丟掉；沒丟（標題 `fix(rebase): point UNIT_EXCLUDE at the zsh test path v1.4.246's pr.yml runs (upstream 0509a2d83a)` 還在 range-diff 的 `=`／`!`）就照第 1 步丟掉。
- 守它的測試：上游 lint 的 `check:test-file-runners`
- 驗證（2026-11-02，v1.4.246）：沒有它 `Runner list is out of date … do not contain "src/main/providers/local-pty-shell-ready-zsh-launch-environment.test.ts"`，有則 `Every checked-in test file is collected by a test runner.`

## bdd997f71f40b2c511e982a4082caa3543c58ebd（#37297、test(cross-version): load moved modules from wherever each release defines them）× fork 10ed999b19（它自己的 cherry-pick -x）— auto-rebase 2026-11-02
- 類型：上游自己就紅（v1.4.246 的 wire 測試從最新 release 載入搬走前的 `src/shared/agent-session-refusal-notice.ts` 等路徑，fork CI 的 `fork cross-version wire compatibility` 紅；乾淨 v1.4.246 同 4 檔 5 例紅）
- 衝突檔：無
- 連帶症狀：無
- 處理：完整 `cherry-pick -x`，patch-id 與上游相同，rebase 到含它的 release 時應自動略過；沒略過就用標題丟掉。
- 守它的測試：fork-pr.yml 的 `fork cross-version wire compatibility`
- 驗證（2026-11-02，v1.4.246）：CI run 41392013082 起全綠；本機 5 檔 23 例綠。

## fork 自身問題（待人判斷，auto-rebase 不要照做：folder 層級的外部變更要不要配對到 repo-scoped diff 分頁：兩條路徑不一致）× fork 8ca8c6583b（feat(source-control): folder workspace 多 repo 變更面板、ClipCode 複製與還原,移植到 v1.4.229）、0bb7357c8f（fix(source-control): folder 分頁的 git/讀檔改由 filePath 推導 repo 相對路徑…）— auto-rebase 2026-10-27（原 sha ebae8279bd、a9b651f3b9，之後 d4ac764be9、4b7966a4eb 都已被 rebase 改寫，canary 2026-11-03 依標題換成目前 develop 的 sha）
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

## 3314da133518d8c0ae9ca5d4355b6b1efff358bd（#37239、Refactor AGENTS.md for clarity and conciseness；同檔另有 0a910e7e9d #37241、1c40f5404d #37243、81103271c1 #37244、bf0f819a31a7ce0fa04e9502ec3ed2a582874ca8 #37281）× fork b865c70fa8（docs(fork): read FORK.md before branching, pushing or opening a PR）、71c7726c2b（docs(fork): restore the CLAUDE.md import; red lines and overrides in versioned files）、8e9b7935bb（docs(fork): diagnose after the third review round; pin long checks）、1a1b35236b（docs(fork): 記錄 fork 的合併閘門、非 UI 測試策略與環境陷阱;fork-check 擋落後基準）— canary 2026-11-03
- 類型：兩邊各改各的
- 衝突檔：AGENTS.md（1 個 hunk，檔尾 `## Git / GitHub` 那段之後）
- 連帶症狀：無
- 處理：上游重寫 AGENTS.md（66 行，刪掉檔尾的 CI 等待／`gh run rerun` 兩段與 `# Tests` 段，測試反模式改成第 20 行的清單項）。採上游全文，檔尾空一行後補回 fork 的 `# Fork Maintenance` 整段（標題、說明段與三個項目，跟 develop 上一字不改）。不要把上游刪掉的 CI 等待、`# Tests` 段加回來。fork 三個項目引用的 `$electron` skill（第 32 行）、hidden-window／no-computer-use（第 29、32 行）、`check:code-quality:changed <base>`（第 5 行）上游新版都還在。
- 守它的測試：逐位元組證明（`vOLD..舊 develop` 與 `vNEW..新 head` 的 AGENTS.md fork 新增行相同、沒刪上游行）
- 驗證（2026-11-03，上游 40f9d2a2468e05310caf1c5172524df0cd95b387）：`git diff HEAD -- AGENTS.md` 只有檔尾 fork 那段 8 行新增；上游 lint 全套通過。合好的檔在 `~/.cache/orca-fork-canary/20261102T213047Z-16898/resolution/files/AGENTS.md`。

## ebf277b4aa91007c83ff6b08f155ca4fbcc30e25（#37544、test: remove 659 low-value renderer tests，與報告列的其他 test removal）× fork 5ec7a0bd16（chore(fork): list fork tests in upstream's new flaky-test pattern baseline）— canary 2026-11-03
- 類型：兩邊各改各的（ratchet baseline：上游刪測試、改計數，fork 在相鄰行插了自己的測試）
- 衝突檔：config/flaky-test-pattern-baseline.txt（3 個 hunk）
- 連帶症狀：上游 lint 的 `lint:ast-grep-gates` 紅（衝突重設成上游 baseline，fork 的 19 個測試檔全變成「baseline allows 0」）
- 處理：照 FORK.md baseline 規則採上游行、只插回 fork 的行，不重排：
  - hunk 1：`2 test-no-real-time-wait:src/renderer/src/lib/execute-open-editor-path-move.test.ts`（上游的值；fork 沒改這個測試，不要留 fork 那側的 `3`）後接 fork 的 `1 test-no-real-time-wait:src/renderer/src/lib/lazy-chunk-recovery-reload.fork.test.ts`。
  - hunk 2：只放 fork 的 `3 …tests/e2e/folder-multi-repo-source-control.spec.ts`、`7 …tests/e2e/git-graph-full-view.spec.ts`、`1 …tests/e2e/git-graph-open-all-changes.spec.ts`；`tests/e2e/git-no-upstream-polling-churn.spec.ts` 那行不要（上游刪了那個檔）。
  - hunk 3：只放 fork 的 `1 test-no-wall-clock:src/renderer/src/lib/workspace-session.fork.test.ts`；`src/renderer/src/lib/workspace-session.test.ts` 那行不要（上游刪了那個檔）。
  - 檔案其他 fork 行自動合入（共 19 行 fork 行，與 lint 報的 19 個檔一致）。
- 守它的測試：上游 lint 的 `lint:ast-grep-gates`
- 驗證（2026-11-03，上游 40f9d2a2468e05310caf1c5172524df0cd95b387）：`pnpm run lint:ast-grep-gates` 通過（`flaky-test-pattern ratchet OK — 3234 grandfathered`）；上游 lint 全套通過。合好的檔在 `~/.cache/orca-fork-canary/20261102T213047Z-16898/resolution/files/config/flaky-test-pattern-baseline.txt`。

## a7d6926f77715e586b0f3908eef2b6111ec398da（#37105、fix(git): show encrypted and textconv files as text diffs, not binary）× fork fdef87db0d（refactor: finish moving fork params into options objects and pin the remaining hops）、07858ccc3b（refactor: carry fork values in options objects instead of trailing positional params）、9de59f0c46（fix(source-control): 修正 folder workspace 多 repo 與 ClipCode 交叉測試找到的問題）、8ca8c6583b（feat(source-control): folder workspace 多 repo 變更面板、ClipCode 複製與還原,移植到 v1.4.229）— canary 2026-11-03
- 類型：兩邊各改各的（另含上游改了 fork 依賴的 API：`git-blob-read.ts` 新 export `blobConversion`，blob 讀取多吃一個 conversion 參數）
- 衝突檔：src/main/git/source-control/file-diff.ts（2 個 hunk）、src/main/git/source-control/submodule-diff.ts（2 個）
- 連帶症狀：typecheck 錯誤 src/main/ipc/filesystem/filesystem-git-status-handlers.ts、src/main/git/source-control/file-diff.skip-render-limit-real-git.test.ts（`skipRenderLimit` 不在 `FileDiffOptions`：衝突重設造成）；失敗測試 src/main/git/source-control/{blob-absence-real-git.fork,file-diff.skip-render-limit-real-git,file-diff.read-failure}.test.ts
- 處理：
  - file-diff.ts：`type FileDiffOptions = GitRuntimeOptions & GitDiffReadOptions & { oldPath?: string }`、`import type { GitDiffReadOptions } from './git-diff-read-options'`、readKey 的 `options.skipRenderLimit === true,` 這些非衝突的 fork 行自動合入。hunk 1：上游的 `conversion`／`leftConversion` 宣告在前，接 fork 的 `let originalMissing = false`、`let modifiedMissing = false`。hunk 2：fork 的 `missingSides` 區塊（`// Why: lets callers tell an empty blob…` 起 7 行）放在 `buildDiffResult(…, tooLarge, options)` 之後、上游新的 `const reusable = !readFailed && !(await conversion.hasDriver) && !(await leftConversion.hasDriver)` 之前；回傳用上游的 `reusable`（不要留 fork 舊的 `reusable: !readFailed`）。
  - submodule-diff.ts：import 兩行都留（fork 的 `import type { GitDiffReadOptions } from './git-diff-read-options'` 在前，上游的 `import { type BlobConversion, blobConversion, readGitBlobAtOidPath } from './git-blob-read'` 在後）；`buildSubmoduleInnerCommitRangeDiff` 參數寫 `options: GitRuntimeOptions & GitDiffReadOptions,`、`mode: BlobConversion['mode']`。
  - fork 測試 src/main/git/source-control/file-diff.read-failure.test.ts：`vi.mock('./git-blob-read', …)` 加 `blobConversion: vi.fn((_worktree: string, _file: string, _options: unknown, mode = 'textconv') => ({ mode, hasDriver: Promise.resolve(false) }))`（oxfmt 會拆成多行），否則 `No "blobConversion" export is defined on the "./git-blob-read" mock`。
- 守它的測試：config/fork-seam-tests.txt 的 skipRenderLimit 組、missingSides and blob absence 組
- 驗證（2026-11-03，上游 40f9d2a2468e05310caf1c5172524df0cd95b387）：套上本次全部條目後 `pnpm tc` 通過；canary 那 209 個測試檔 1109 例全過；上游 lint 全套（`fork-lint-run.mjs`，40 步）通過；另跑 file-diff／git-blob-read 等附近上游測試通過。合好的檔在 `~/.cache/orca-fork-canary/20261102T213047Z-16898/resolution/files/`（整份 diff：上一層的 `resolution.diff`，對 canary 重設後的合併樹）。

## e59b843336bbb747a89d79d1ca3fea8ac98269eb（#37204、Keep review note changes on the workspace copy they came from；ChangesModeView／EditorDiffFileSurface 同 hunk 另有 8e8db01f03bd36c163014b535af3cf8b8d2ce28f #37263）× fork 8ca8c6583b（feat(source-control): folder workspace 多 repo 變更面板、ClipCode 複製與還原,移植到 v1.4.229）、9de59f0c46（fix(source-control): 修正 folder workspace 多 repo 與 ClipCode 交叉測試找到的問題）、b539d5f235（feat(diff): step into the next file at the last change, IntelliJ-style）、7b39aeb676（refactor(fork): 縮小 fork 在上游檔的接線，先吸收下一版的衝突）、5797a9d6f7（refactor(editor): move the fork's file-read git owner out of the loaders upstream grew to max-lines）、07858ccc3b（refactor: carry fork values in options objects…）— canary 2026-11-03
- 類型：兩邊各改各的（上游讓筆記改由 `worktreeId` 加 `noteSource`（分頁的 provenance）決定擁有者，`useVisibleWorktreeDiffComments` 回 `{ owner, comments, … }`，送出選單吃 `owner`；fork 在同一處把 folder 分頁的 worktreeId 換成 repo 的 `getOpenFileGitWorktreeId(…)`）
- 衝突檔：src/renderer/src/components/editor/{ChangesModeView,EditorDiffFileSurface,EditorPanelHeader}.tsx、src/renderer/src/components/editor/combined-diff/CombinedDiffViewer.tsx（2 個 hunk）、src/renderer/src/components/editor/combined-diff/scroll-viewport/combined-diff-section-list.tsx、src/renderer/src/components/right-sidebar/source-control/notes/notes-shelf.tsx（2 個）
- 連帶症狀：typecheck 錯誤 combined-diff-section-list.fork.test.tsx（缺必填 `commentOwner`）、notes-shelf.fork.test.tsx（`deleteDiffComment` 型別）：這兩個不是衝突，要改 fork 測試；失敗測試 src/renderer/src/components/editor/{ChangesModeView,EditorDiffFileSurface}.fork.test.tsx、EditorPanel.fork.test.tsx 的 `shows the repo file notes in the folder diff header…`、CombinedDiffViewer.fork.test.tsx（6 例）、combined-diff-section-list.fork.test.tsx、notes-shelf.fork.test.tsx
- 處理（原則：worktreeId 用 fork 的 repo owner，上游新加的 `noteSource`／`owner` 都留）：
  - ChangesModeView.tsx：`syncKeptModifiedModelOnMount`（fork 9de59f0c46 的 prop）、`worktreeId={getOpenFileGitWorktreeId(activeFile)}`、`noteSource={activeFile}` 三行。
  - EditorDiffFileSurface.tsx：`worktreeId={getOpenFileGitWorktreeId(activeFile)}`、`noteSource={activeFile}`。
  - EditorPanelHeader.tsx：`const { owner: commentOwner, comments: diffComments } = useVisibleWorktreeDiffComments(getOpenFileGitWorktreeId(activeFile), activeFile)`（上游的多行寫法，第一個參數換掉）。
  - CombinedDiffViewer.tsx：hunk 1 留上游的註解與 `const notesView = useVisibleWorktreeDiffComments(gitWorktreeId, file)`（第一個參數換成 fork 的 `gitWorktreeId`）；hunk 2 採上游（`useCombinedDiffNotesActions` 改吃 `owner: notesView.owner`，不要加回 fork 的 `worktreeId: gitWorktreeId`）。
  - combined-diff-section-list.tsx：`worktreeId={getOpenFileGitWorktreeId(file)}`、`noteSource={file}`。
  - notes-shelf.tsx：hunk 1 兩邊都留（上游 `const { owner } = useDiffCommentView(activeWorktreeId, 'selection')` 在前、fork 的 `sendWorktreeId` 註解與宣告在後）；hunk 2 寫 `owner={owner}`、`worktreeId={sendWorktreeId}`、`groupId={activeGroupId ?? sendWorktreeId}`（筆記擁有者是 repo，送去的 agent 在 folder）。
  - fork 測試：combined-diff-section-list.fork.test.tsx 在 `canOpenWorkspaceFileBrowserForPath` 後加 `commentOwner={null}`（只餵送出選單，這例只驗筆記畫出來）；notes-shelf.fork.test.tsx 的 `deleteDiffComment={() => {}}` 改 `deleteDiffComment={async () => {}}`。
- 守它的測試：config/fork-seam-tests.txt 的「Editor folder git-owner routing, mounted owner changes, and diff review notes」組、「Folder source-control action routing」組（notes-shelf.fork）、CombinedDiffViewer.fork.test.tsx
- 驗證（2026-11-03，上游 40f9d2a2468e05310caf1c5172524df0cd95b387）：同 a7d6926f77 那條（tc、209 檔、lint 全過）；另跑 ChangesModeView／EditorDiffFileSurface／EditorPanel／CombinedDiffViewer／notes-shelf／use-diff-comment 等附近上游測試 24 檔 138 例全過。

## ba50135f9c616c0c71fcb5a0378f6c882c80e291（#37278、fix(plugins): hand over pending custom-editor edits before closing or reloading）× fork 8ca8c6583b（feat(source-control): folder workspace 多 repo 變更面板、ClipCode 複製與還原,移植到 v1.4.229）、9de59f0c46（fix(source-control): 修正 folder workspace 多 repo 與 ClipCode 交叉測試找到的問題）、b539d5f235（feat(diff): step into the next file at the last change, IntelliJ-style）— canary 2026-11-03
- 類型：兩邊各改各的（import 區相鄰）
- 衝突檔：src/renderer/src/components/editor/EditorPanel.tsx（1 個 hunk，import 區）
- 連帶症狀：失敗測試 src/renderer/src/components/editor/EditorPanel.fork.test.tsx 的 `disables opening a working file deleted in the folder tab repo`、`opens a restored folder diff with its repo owner before the repo catalog reloads`（衝突重設造成）
- 處理：兩行都留：上游 `import { runAfterEditorFramesFlush } from './editor-pending-flush'` 在前、fork `import { getOpenFileGitWorktreeId } from '@/store/slices/editor/git/open-file-git-owner'` 在後。檔案其他 fork 行自動合入。
- 守它的測試：EditorPanel.fork.test.tsx（Editor folder git-owner routing 組）
- 驗證（2026-11-03，上游 40f9d2a2468e05310caf1c5172524df0cd95b387）：同 a7d6926f77 那條。

## 764bd0be449da465db1c90f7d10be394e1b42974（#36539、Continue Fix checks and project actions through setup confirmation）× fork 06cb84247a（fix(source-control): judge chat eligibility with the folder repo launch's start directory）、8ca8c6583b（feat(source-control): folder workspace 多 repo 變更面板…）— canary 2026-11-03
- 類型：兩邊各改各的
- 衝突檔：src/renderer/src/components/right-sidebar/useSourceControlAgentActionDialog.ts（1 個 hunk）
- 連帶症狀：失敗測試 src/renderer/src/components/right-sidebar/SourceControlAgentActionDialog.folder-cwd.test.tsx（2 例）、src/renderer/src/components/right-sidebar/source-control/panel/{commit-surface,panel-dialogs}.fork.test.tsx（3 例）
- 處理：採上游的 `useSourceControlAgentActionStart({ … })` 呼叫（解構多了 `isCreateAccepted`、縮排改成兩格），在 `groupId,` 後面加回 fork 的 `initialCwd,` 一行。
- 守它的測試：config/fork-seam-tests.txt 的「Agent launch cwd in folder repos」組（`× cannot start a saved chat-only agent for a repo below the folder root`、`× starts a terminal agent in the folder workspace at the repo directory`）
- 驗證（2026-11-03，上游 40f9d2a2468e05310caf1c5172524df0cd95b387）：同 a7d6926f77 那條。

## c24d916f3118e4296cfbf2fd268af17664f8add3（#36003、Route hosted review operations to the owning host）× fork 86e733b519（test(git-graph-tab): pin lazy retry and old-client exclusion; rename editor-kind modules）、20995bc2a6（test(git-graph-tab): drop the guard entry for old-client review rows upstream removed）— canary 2026-11-03
- 類型：上游改了 fork 依賴的 API（上游新增 3 個提到 `'check-details'` 的地方，fork 的 editor-kind 守門測試要判斷 git-graph 該不該跟）
- 衝突檔：無
- 連帶症狀：失敗測試 src/shared/fork-editor-kind-sites.guard.test.ts（`every file listing check-details handles git-graph or is allowlisted`：多出 3 個檔）
- 處理：三處都只處理 check-details 自己的遠端擁有者，git-graph 走預設路徑即可（`workspace-editor-item.ts` 的 `drawHere` 只讓 editor 與 check-details 帶 file 的 `executionHostId`，diff 等其他分頁同樣不帶，跟 develop 目前行為相同）。在測試的 `ALLOWED` 尾端加三條：`renderer/src/store/slices/editor/actions/check-run-details-owner.ts` → `'finds the execution host of a check-details tab; git-graph has no remote check owner'`；`renderer/src/store/slices/editor/tabs/workspace-editor-item.ts` → `'only editor and check-details tabs carry their file host; git-graph keeps the default like diff'`；`shared/workspace-layout/workspace-layout-load-workspace.ts` → `'restores check-details request scopes; a Git Graph tab has none'`。
- 守它的測試：fork-editor-kind-sites.guard.test.ts（git-graph tab type 組）
- 驗證（2026-11-03，上游 40f9d2a2468e05310caf1c5172524df0cd95b387）：guard 2 例通過（allowlist 的「still names check-details and still lacks git-graph」那例也過）；其餘同 a7d6926f77 那條。

## 999160b3db73e18dc11d63ddc83329912a6e2baf（#37316、feat(plugins): commands[].replaces lets a mod take over a built-in action）× fork 4c74b6f48a（test(fork): 守住 Git Graph 快捷鍵與 Commits dock 的 fork slot，slot 收進一個 builder）、6ab91bb97c（test(fork): Commits dock 測試執行檔案選單 slot、toolbar 用 remote target；Git Graph 快捷鍵涵蓋 macOS Cmd 與 Linux）— canary 2026-11-03
- 類型：上游改了 fork 依賴的 API（app 指令派送 `claim` 改走 `pluginReplacementFor`，讀 `@/store/plugin-panels` 的 `usePluginPanelsStore`、`collectActivePluginCommands`）
- 衝突檔：無
- 連帶症狀：失敗測試 src/renderer/src/app-shell/git-graph-shortcut.keybindings.test.ts（3 例，`ReferenceError: reportError is not defined`：listener 先丟了 `No "usePluginPanelsStore" export is defined on the "@/store/plugin-panels" mock`，router 再呼叫 happy-dom 沒有的 `reportError`）
- 處理：只改 fork 測試的 mock：`vi.mock('@/store/plugin-panels', () => ({ usePluginCommands: () => [], usePluginPanelsStore: { getState: () => ({ plugins: [] }) }, collectActivePluginCommands: () => [] }))`（oxfmt 拆成多行）。產品程式不用改。
- 守它的測試：git-graph-shortcut.keybindings.test.ts（Keybinding 組）
- 驗證（2026-11-03，上游 40f9d2a2468e05310caf1c5172524df0cd95b387）：3 例通過；其餘同 a7d6926f77 那條。

## 9599d718b6853c27fcfa448f86e30e04a85f8519（#37093、Clarify Git operation status across workspaces）× fork eb57ece96f（test: move fork cases out of upstream test files into .fork.test siblings）— canary 2026-11-03
- 類型：上游改了 fork 依賴的 API（`use-worktree-context.ts` 新讀 store 的 `remoteOperations` 陣列）
- 衝突檔：無
- 連帶症狀：失敗測試 src/renderer/src/components/right-sidebar/SourceControl.preview-open.fork.test.tsx（`Cannot read properties of undefined (reading 'findLast')`）
- 處理：只改 fork 測試的 store 替身：`resetState` 裡 `isRemoteOperationActive: false,` 後加 `remoteOperations: [],`。
- 守它的測試：SourceControl.preview-open.fork.test.tsx（Upstream component slots and folder routing 組）
- 驗證（2026-11-03，上游 40f9d2a2468e05310caf1c5172524df0cd95b387）：1 例通過；其餘同 a7d6926f77 那條。
