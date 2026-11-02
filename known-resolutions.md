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

## fork 自身問題（待人判斷，auto-rebase 不要照做：folder 層級的外部變更要不要配對到 repo-scoped diff 分頁：兩條路徑不一致）× fork d4ac764be9（feat(source-control): folder workspace 多 repo 變更面板、ClipCode 複製與還原,移植到 v1.4.229）、4b7966a4eb（fix(source-control): folder 分頁的 git/讀檔改由 filePath 推導 repo 相對路徑…）— auto-rebase 2026-10-27（原 sha ebae8279bd、a9b651f3b9 已被 rebase 改寫，canary 2026-10-31 依標題換成目前 develop 的 sha）
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
