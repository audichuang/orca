# 處理紀錄

之前的 auto-rebase、canary 與人工處理各做了什麼，新的在最上面，只增不刪。遇到 `known-resolutions.md` 沒寫到的衝突或問題，先在這裡找同一個檔或同一個 fork commit 的前例照做。auto-rebase 每次 run 都會加一條；用掉的 `known-resolutions.md` 條目整段搬到這裡。只經 `config/scripts/fork-notes.sh` 寫。

## 2026-10-26 run 121 的流程修正 — PR #84（已合併）
- 無人值守的 pipeline 一律前景等待：Orca automation 看到 agent 結束這一輪就判 run 完成並可能關 terminal。長指令跑成 `<指令> > LOG 2>&1; echo $? > LOG.exit`，用 `config/scripts/fork-wait-for-job.sh` 分段等；**每個等待的 Bash 呼叫要傳 `timeout: 600000`**（預設 2 分鐘，超過一樣被移到背景）；CI 用 `gh-wait -t 9`、Codex 用 `codex-companion wait --timeout-ms 540000`；Claude 審查者改用 `claude -p` 子行程（Agent 工具只能在背景跑）。LOG 每輪換新名，舊的 `.exit` 會讓等待立刻結束。
- `fork-lint-run.mjs` 與 `make fork-check-lint` 跑完每一步再列出全部失敗；canary 在合併樹跑上游 lint（只報告），`canary-last.json` 多 `lintFailures`。
- auto-rebase 本機閘門改成 `make -k fork-check-static` 加 seams；整套單元測試、e2e、wire、mobile 只在 CI 跑；推上去就開盲審，跟 CI 同時跑；第 7 步推 main 後再停用一次上游 workflow。cherry-pick 的上游 lint 修正以「改回那一步 lint 會紅」為證明，翻譯另一個 commit（patch-id 才對得上上游）。
- 已處理的 `known-resolutions.md` 條目「fork 自身問題（seam 清單漏登錄 d809e41db0 新增的測試）」：`tab-bar-item-model.git-status.fork.test.ts` 登錄進「Upstream component slots and folder routing」組，條目已刪。
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
