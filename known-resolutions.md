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

## fork 自身問題（既有無測接線，審查者 C 在 v1.4.247 rebase 列出，不在這次解過的 hunk 上）× fork 既有 folder／Git Graph／ClipCode 接線 — auto-rebase 2026-11-03
- 類型：fork 自身問題
- 衝突檔：無
- 連帶症狀：無（拿掉接線後整份 seam 清單全綠）
- 處理：各補一個拿掉會紅的測試，加進 config/fork-seam-tests.txt：
  - `src/renderer/src/components/right-sidebar/source-control/panel/use-panel-model.ts:145` 轉送給 `useGitHistoryCommitActions` 的 `editorWorktreeId`（目前只有 `pnpm tc` 因必填參數守）。
  - `src/renderer/src/store/slices/editor/actions/git-graph-tab-actions.ts:91` 的 `existingGroupId`（改成 `undefined` 時 git-graph tab type 組全綠）。
  - `src/renderer/src/components/right-sidebar/source-control/clipcode/clipcode-restore-preview-dialog.tsx:150` 關閉時的 `onCancel()`（拿掉時 ClipCode 組全綠）。
  - 「gitWorktreeId on editor open actions」組本身擋不住 EditorPanel 的 `gitWorktreeId`、`use-worktree-context` 的 `editorWorktreeId` 與 `use-panel-model.ts` 的 notes 轉送（別組會紅），清單分組可調整。
- 守它的測試：待補
- 驗證：未驗證（只有 PR #111 審查者 C r1 的 mutation 結果）
