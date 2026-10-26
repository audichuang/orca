---
name: orca-fork-auto-rebase
description: Unattended pipeline that rebases the Orca fork's develop onto the newest upstream release tag, verifies it with local checks, Fork CI, e2e and blind reviewers, then moves develop and releases when every gate passes, or leaves a verified PR for the user. Use when the "Orca fork 自動 rebase" Orca automation fires, or when the user asks to run or resume that pipeline.
---

# Orca fork 自動 rebase

無人值守：沒有人會回答問題，不要停下來問。repo 是 audichuang/orca（remote `fork`），上游 stablyai/orca（remote `origin`）。規則來源是 `git show fork/develop:FORK.md` 的 Merge gate 與 Release 兩節，先讀；這裡沒寫的照它。

本技能覆寫兩個預設：codex 技能的「找到問題不自動修、停下來問」在這裡不適用（第 5 步規定怎麼修）；`orca-lcu-ui-test` 與 Codex desktop 的真實 UI 測試輪**不在這裡跑**——它們會占用螢幕鍵盤剪貼簿，排程隨時會觸發。發版前要驗的 UI 情境（ClipCode 複製、Paste & Restore、資料夾 repo 清單、session restore、external-change banner、agent launch cwd）由 fork e2e 在隱藏視窗驗（`folder-multi-repo-source-control.spec.ts`、`folder-workspace-tab-restart-restore.spec.ts`），第 3 步的 `fork-check-e2e` 與 CI 都會跑；lcu 實機輪只留給新增或改了 UI 的功能 PR。

本文的變數：

- `SKILL_DIR`：這個 SKILL.md 所在目錄。
- `MAIN`：Orca 為這次 run 開的 worktree 的絕對路徑（`pwd -P`，開頭先記下）。
- `RUN`：`date -u +%Y%m%dT%H%M%SZ`，開頭記一次。這次 run 自己的暫時 worktree 一律叫 `../ar-$RUN-<名字>`，名字不會跟別的 run 撞，第 0 步也靠這個前綴認出殘留。
- `vNEW`、`vOLD`、`OLD_DEVELOP`、`PR`：第 0 步定義。

所有 gh 呼叫間隔放寬（API 配額與 release workflow 共用）。等 CI 用 `gh-wait`，不要用 `gh pr checks --watch`、`gh run watch` 或 sleep 迴圈。

## 0. 決定模式

```sh
git fetch fork --tags && git fetch origin --no-tags '+refs/tags/v*:refs/tags/v*'
```

- vNEW = 上游最新**已發布的 GitHub Release**：`gh api repos/stablyai/orca/releases/latest --jq .tag_name`（須符合 `^v[0-9]+\.[0-9]+\.[0-9]+$`）。上游也會推從沒發布成 Release 的 tag（例如 v1.4.236），那些不算，不要用 `git ls-remote` 取最大 tag。
- vOLD = `git describe --tags --abbrev=0 --match 'v[0-9]*.[0-9]*.[0-9]*' --exclude '*-fork*' fork/develop`。
- 有沒有進行中的 rebase，用 `git ls-remote fork 'refs/heads/rebase/*'` 判斷（remote-tracking ref 可能是 GitHub 上已刪掉的殘影）。有 `rebase/vX`：
  - PR 開著、有 `<!-- auto-rebase:develop-moved <sha> -->` 留言（前一次 run 移動 develop 後、發版途中死了）→ **RESUME 發版**：vNEW=vX，PR=那個 PR，先在 PR 留言「resume 發版（RUN=$RUN）」，直接做第 7 步，發的是留言裡的 sha。vOLD、OLD_DEVELOP 與用掉的筆記條目取 PR 說明（old-develop 那行、`develop = vOLD + …` 那行、第 1 步列的條目），第 8 步寫筆記要用；`git describe` 這時已經算出 vX。
  - 它對 `ci-base/vX` 的 PR 還開著、沒有這三種留言（見上一項與下一項）→ **RESUME**：`git checkout --detach fork/rebase/vX`，vNEW=vX，PR=那個 PR。OLD_DEVELOP 取 PR 說明裡的 `<!-- auto-rebase:old-develop <sha> -->`，不要重算：develop 在這期間可能已經合進別的 PR，重算會讓第 6 步的 lease 通過、把那些 PR 從 develop 蓋掉。說明裡沒有這行（舊 PR）→ 照常驗證，但第 6 步一律不移動。先在 PR 留言「resume 開始（RUN=$RUN）」：鎖是因為過期才讓你跑到這，不留言的話，下一次排程還會判定過期、再開一個 RESUME 把你的 worktree 刪掉。適用的筆記條目看 PR 說明裡第 1 步列的那幾條。從第 2 步開始；CLEAN/MANUAL 依 PR 說明（有手動解衝突或額外 commit 就是 MANUAL）。
  - PR 開著、已有 `<!-- auto-rebase:verified -->` 或 `<!-- auto-rebase:needs-human -->` 留言（等人審或等人接手）：precheck 只在這把鎖過時才讓你跑到這（上游有比 vX 新的 release，或 develop 的基底已經是 vX）。
    - develop 的基底已是 vX、`git ls-remote fork refs/heads/develop` 等於 `rebase/vX` 的 tip、`git ls-remote fork 'refs/tags/vX-fork.*'` 沒有指著它的 tag（annotated tag 要比對 `^{}` 那行，那才是 commit；使用者照 verified 留言推了 develop，沒發版也沒收鎖）→ vNEW=vX，PR=那個 PR，留言 `<!-- auto-rebase:develop-moved <那個 sha> -->`，做第 7 步（vOLD 等取 PR 說明，同上一項）。
    - 其他（被更新的 release 取代，或 develop 已經是別的樣子）→ **收鎖**：`rebase/vX` 的 tip 不在 `fork/develop` 或 `fork/backup/*` 上就先 `git push fork "fork/rebase/vX:refs/heads/backup/rebase-vX-$RUN"`；PR 留言說明原因（「上游已發 vNEW，改從新版重來；這次的處理見 PR 說明與 resolution-history.md」或「develop 已在 vX」）後 `gh pr close`，刪 fork 的 `rebase/vX` 與 `ci-base/vX`。PR 說明裡第 1 步列的解法、第 5 步的審查結論、卡住的原因，照第 8 步「寫筆記」記進筆記（前一次 run 已寫過就不重寫）。然後重新判斷：vNEW == vOLD 就結束、不推通知；否則 **NEW**。
  - 沒有開著的 PR（前一次 run 在開 PR 前就死了，預檢判定鎖已過期才會讓你跑到這）→ 先確認刪了不會丟東西：`rebase/vX` 的 tip 訊息是 `auto-rebase lock vX`，或 `git branch -r --contains fork/rebase/vX` 列得出 `fork/develop` 或 `fork/backup/`。不是的話（可能是使用者關了 PR 繼續在上面做），先 `git push fork fork/rebase/vX:refs/heads/backup/rebase-vX-$RUN` 備份。然後 `git push fork --delete rebase/vX`，再另外 `git push fork --delete ci-base/vX`（不存在會報錯，忽略），當成 **NEW** 重來。
- 沒有 `rebase/*` 且 vNEW == vOLD → 結束，不推通知。
- 否則 **NEW**：OLD_DEVELOP = `git rev-parse fork/develop`，從第 1 步開始。

下文的 `OLD_DEVELOP`、`vNEW`、`vOLD`、`PR` 寫進指令時代換成實際值；用 shell 變數的話，後面緊接 `:` 一律寫 `${OLD_DEVELOP}:`（zsh 會把 `$OLD_DEVELOP:r…` 的 `:r` 當成修飾符吃掉）。

開始前清掉之前 run 留下的 worktree（狀態都在 fork 上）：

- `git worktree list` 裡路徑含 `auto-orca-fork-rebase-run-` 而且不是 `MAIN` 的，逐一 `orca worktree rm --worktree "id:622b02e4-f394-4c0d-a683-b027f426796b::<路徑>" --force --json`；目錄名以 `ar-` 開頭、`$RUN` 不是這次的暫時 worktree，用 `git worktree remove --force`。
- 只刪「刪了也不會丟東西」的：`git -C <路徑> status --porcelain` 沒有任何輸出（含未追蹤檔；`.rebase-review/` 已在 exclude 裡，不算）、`git -C <路徑> rev-parse -q --verify REBASE_HEAD` 失敗（不在 rebase 中），而且 `git -C <路徑> branch -r --contains HEAD` 列得出 `fork/` 開頭的分支（commit 都在 fork 上）。其他的不刪，列進第 8 步通知：可能是使用者接手的分支（第 2 步「分支照推讓使用者接手」），或還沒推上去的修正。同時跑兩個 run 只會發生在鎖過期時，那時前一個 run 已經停止心跳六小時。

一律在 `MAIN` 做，不要動 `~/Project/orca` 主 checkout。**全程用 detached HEAD，推送寫明目的地**（`git push fork HEAD:refs/heads/rebase/vNEW`）：本機沒有 `rebase/vNEW` 這條分支，前一次 run 的 worktree 也可能 checkout 著同名分支。

## 1. Rebase（NEW）

1. 先上鎖再動手，不然解衝突超過一小時，下一次排程會再開一輪：
   ```sh
   lock=$(git commit-tree "${OLD_DEVELOP}^{tree}" -p "${OLD_DEVELOP}" -m "auto-rebase lock vNEW")
   git push fork "${lock}:refs/heads/rebase/vNEW"
   ```
   這個 commit 的時間是現在，precheck 拿它判斷鎖是否過期。之後每次推 `rebase/vNEW` 都是 `--force`。
2. `git checkout --detach OLD_DEVELOP`，讀筆記：`tip=$(config/scripts/fork-notes.sh tip) && mkdir -p "$MAIN/.rebase-review" && for f in known-resolutions.md resolution-history.md; do git show "${tip}:$f" > "$MAIN/.rebase-review/$f" || : > "$MAIN/.rebase-review/$f"; done`（`fork-notes.sh` 是 fork 自己的檔案，rebase 中途可能不在工作樹，所以先讀）。`known-resolutions.md` 是待處理的建議：canary 對上游 main 試合時看過的衝突、「該丟掉的 fork commit」，以及 fork 自身問題；`resolution-history.md` 是之前怎麼處理過的紀錄，遇到筆記沒寫到的衝突，先在裡面找同一個檔或同一個 fork commit 的前例照做。條目適用於這次的條件：一般條目是 `git merge-base --is-ancestor <條目的上游 commit> vNEW`；類型是「fork 自身問題」的條目沒有上游 commit，條目列的檔案在 OLD_DEVELOP 上還在、修正還沒做就適用。`fork-notes.sh` 回非 0 → 沒有筆記也能做，照常 rebase，在通知裡註明。
3. Rebase：先 `node config/scripts/fork-merge-driver-install.mjs`（讓 locale JSON 由 driver 合併；driver 複製進 git 目錄，rebase 中途工作樹沒有它也能用），再 `git rebase --onto vNEW vOLD`（FORK.md 說明為何要 --onto）。條目要丟掉某個 fork commit 時，改用：
   ```sh
   d=$(git rev-parse --short <要丟的 fork commit>)
   GIT_SEQUENCE_EDITOR="sed -i '' -e '/^pick ${d} /s/^pick/drop/'" git rebase -i --onto vNEW vOLD
   ```
   要丟的 commit 必須在這次的 develop 上：`git merge-base --is-ancestor <條目的 sha> OLD_DEVELOP`。不在（條目是在上一次 rebase 前寫的，sha 已被改寫）就用條目寫的 commit 標題在 `git log --format='%h %s' vOLD..OLD_DEVELOP` 找，標題完全相同的剛好一個才用它；找不到或不只一個 → 不 rebase，鎖留著，跳到第 8 步交給人（筆記說要丟的 commit 沒丟，後面的閘門都綠也不能發）。todo 清單用 `git rev-parse --short` 的長度，所以先轉換。rebase 完用 `git range-diff vOLD..OLD_DEVELOP vNEW..HEAD` 確認那個 commit 是 `<`（被丟掉）；不是就 `git checkout --detach OLD_DEVELOP` 回到起點重做一次（rebase 已經結束，`--abort` 沒有作用），第二次還不是就當失敗（第 5 點）。
   rerere 已開；重放後仍要 `git add` 才能 continue。適用的條目照它處理、在 PR 說明裡逐條列出；它跟眼前的衝突對不上就以眼前為準，並在通知裡註明。
4. CLEAN = 完全沒衝突、也沒丟 commit；MANUAL = 有任何衝突（**rerere 自動重放的也算**：那是對舊上游錄下的解法，要跟自己解的一樣過 mutation 證明）、丟掉了 commit、或有額外修正 commit。
5. 自己解：保留 fork 功能、採上游新結構（FORK.md 的 seam 原則）；locale 兩邊只新增 key 時 driver 已合好、不算衝突；還停在 locale 檔，代表兩邊改了同一個字串（driver 留下衝突標記），兩邊 key 都保留、字串照筆記條目或上游新文案決定，之後 `pnpm run verify:localization-catalogs`。沒把握就 `git rebase --abort`，鎖留著，跳到第 8 步：那裡會開 PR 並標 `needs-human`。放掉鎖的話，下一次排程會重跑同一個註定失敗的 rebase，每小時推一次失敗通知。
6. 適用的「fork 自身問題」條目：rebase 完成後照條目改，一條一個 commit（算 MANUAL），跑條目「守它的測試」確認通過。
7. `git push --force fork HEAD:refs/heads/rebase/vNEW`，然後馬上開 PR（第 2 步可能跑好幾小時，PR 開了才能留心跳）：`git push fork "vNEW^{commit}:refs/heads/ci-base/vNEW"`（上游 tag 是 annotated tag，不加 `^{commit}` 推不上分支），`gh pr create -R audichuang/orca --base ci-base/vNEW --head rebase/vNEW --title "[不合併] develop rebase 到 vNEW 的 CI 驗證"`，記下編號當 `PR`。body 第一行放 `<!-- auto-rebase:old-develop OLD_DEVELOP 的完整 sha -->`（RESUME 靠它），其餘照 PR #22/#29 的格式（不合併的原因、`develop = vOLD + N 個 fork commit` → `vNEW + …` diff 區塊、每個衝突檔怎麼解、用了哪幾條筆記、額外 commit、Merge Danger），結尾 `🤖 Generated with [Claude Code](https://claude.com/claude-code)`。之後各步有新的衝突解法或修正就 `gh pr edit` 補進說明。
8. `make fork-check-lint` 直接讀 `package.json` 的 `"lint"` 逐項執行（`config/scripts/fork-lint-run.mjs`），上游增減 lint 項目不用手動同步。只有兩種情況要動它，另外 commit（算 MANUAL）：上游拿掉了 `EXCLUDED` 裡的項目（腳本會報錯要你刪掉那筆排除），或 `lint` script 出現它拒絕的寫法（換行、管線等 shell 語法）。

所有 commit：message 英文，結尾 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。

## 2. 本機閘門（一律跑，不分 CLEAN/MANUAL）

先在 PR 留言「本機閘門開始」（心跳；修失敗的每一輪開始時也各留一則）。`pnpm install --frozen-lockfile`，然後 `make fork-check`，再 `make fork-check-seams`（`config/fork-seam-tests.txt` 列的 fork seam contract 測試，一個不漏地跑；沒有這個 target 的舊 develop 就略過並註明）。`make fork-footprint` 的輸出貼進 PR 說明（fork 在上游檔案上的足跡，跟上一次 rebase 比）。

macOS 上 `fork-check-tests` 會連上游自己的測試一起報紅（`orca-runtime.test.ts` 的 `/var` 對 `/private/var`，CI 的 Linux 上會過）；只有這種的不算回歸，失敗清單照貼進 PR。其他 vitest 失敗照下面處理。

**失敗處理（新的 vitest 失敗、第 3 步的 e2e）**：在乾淨的上游 worktree 重現同一個檔案。上游 tag 沒有 `Makefile` 和 fork 的 config，所以用 make 底下的原始指令：

```sh
git worktree add --detach ../ar-$RUN-base vNEW && cd ../ar-$RUN-base && pnpm install --frozen-lockfile
LC_ALL=C ORCA_BACKGROUND_LAUNCH=1 pnpm exec vitest run --config config/vitest.config.ts <測試檔>
pnpm run ensure:electron-runtime && LC_ALL=C ORCA_BACKGROUND_LAUNCH=1 npx playwright test <spec> --config tests/playwright.config.ts --project=electron-headless --workers=1
```

只有「fork 失敗、上游通過」才算回歸，要修（修正 commit 算 MANUAL）。兩邊都失敗才可排除，而且**兩份輸出的尾段都要貼進 PR**，沒貼不准排除。同一個問題修兩輪還不過 → 第 8 步回報，分支照推讓使用者接手。

## 3. 推上去：fork CI 與 e2e 並行

- 第 2 步有修正 commit 就 `git push --force fork HEAD:refs/heads/rebase/vNEW`；PR 第 1 步已開（RESUME 沿用既有 PR），CI 跟著 head 跑。
- 等 CI 的同時跑 e2e（本機）：
  1. `make fork-check-e2e FORK_BASE=vNEW`：跟 CI 同一個 target，選 spec 的方式一樣（folder spec 加上 fork 新增或改過的 e2e），開跑前會先等 1 分鐘 load 降到核心數以下，最多等 10 分鐘；仍高照跑，但結果註明負載。
  2. 失敗 → 先在負載降下來時重跑一次，再照第 2 步的失敗處理對照：spec 在 vNEW 存在就在 vNEW 跑；是 fork 自己的 spec（上游沒有）就在 OLD_DEVELOP 跑（`git worktree add --detach ../ar-$RUN-olddev OLD_DEVELOP && (cd ../ar-$RUN-olddev && pnpm install --frozen-lockfile)`，那裡有 Makefile，可直接 `make`）。舊 develop 上也失敗 = fork 既有問題，不擋這次 rebase，但要在通知裡列為「develop 既有紅測試」。
  3. 接著 `make fork-check-wire` 和 `make fork-check-mobile`，分兩個指令跑（CI 的跨版本 wire 與 mobile web app 兩個 job，約 4 分鐘；寫在同一個 make 裡，前一個紅了後一個就不跑）。失敗照第 2 點對照 vNEW。
- CI：`gh-wait pr PR -R audichuang/orca` 等完，看「Fork PR checks passed」。有 job 紅：`gh run list -R audichuang/orca --workflow fork-pr.yml --commit <head> --limit 1 --json databaseId` 取 run id，先 `gh run rerun <id> --failed -R audichuang/orca` **自動重跑一次**再 `gh-wait run <id> -R audichuang/orca`（偶發失敗，例如會讀剪貼簿的 e2e，在 CI 層重跑；fork-check 目標裡不加任何豁免）。同一個 job 第二次還紅才算真的失敗：看 `gh run view <id> --log-failed -R audichuang/orca`，照第 2 步的規則處理；fork e2e 失敗另外照 FORK.md「When a fork e2e goes red」下載 artifact 看 `shots/`。重跑過的 job 在第 8 步的通知裡註明。
- e2e、wire、mobile 的結果（通過數、失敗與對照）貼成 PR 留言。這則留言也是心跳：precheck 看 PR 的更新時間判斷這個 run 還活著，所以第 4、5 步每個階段開始時也各留一則短留言（「盲審開始」「第 2 輪審查開始」）。

## 4. 盲審（本機、CI、e2e、wire、mobile 都綠才做；不審紅的 build）

產生審查素材：

```sh
bash "$SKILL_DIR/scripts/review-bundle.sh" vOLD OLD_DEVELOP vNEW HEAD "$MAIN/.rebase-review"
```

（`.rebase-review/` 不要 commit。）腳本回非 0 就沒有完整素材可審：當成審查沒通過，不移動 develop，照第 8 步留給人。裡面有 `range-diff.txt`、`extra-commits.diff`、`upstream-touching.diff`、`importer-sweep.txt`、`seam-upstream.diff`、`README.txt`。`seam-upstream.diff` 是上游 vOLD..vNEW 對「fork 改過的上游檔、fork 新檔 import 的上游模組、含 fork seam 關鍵字的檔」的改動，**CLEAN 時它就是審查的主體**：沒有文字衝突不代表上游沒有新增一條繞過 fork seam 的平行路徑（新的 content type switch 沒有 `'git-graph'`、新的 updater 入口沒有 `isForkDistribution()`、重組參數時丟了 `skipRenderLimit`、slot 不再被渲染）。

**會改檔的審查者（C 與 Codex）各用一個自己的 worktree**：`git worktree add --detach ../ar-$RUN-review-<名字> HEAD && (cd ../ar-$RUN-review-<名字> && pnpm install --frozen-lockfile)`，否則改回上游那一側的實驗會污染其他人正在讀的樹；A、B 用 `MAIN` 唯讀。

**同時**開審查者，每個只拿素材資料夾路徑與（自己的）worktree 路徑，**不給 PR 說明、不給你的解衝突理由**（盲審：讓他們自己判斷，不被你的敘述帶著走）：

- Claude 審查者：用 Agent 工具，`subagent_type: general-purpose`（不要用 fork，fork 會繼承你的脈絡），各一個角度：
  - **A 衝突忠實度**：`range-diff.txt` 每個 `!` 項目，新版是否保留 fork 原本的行為、同時採用上游的新結構？有沒有 fork 的欄位、分支、呼叫被默默丟掉？每個 `<` 項目（rebase 後消失的 fork commit）是不是刻意丟的、理由是否成立？
  - **B 上游 API 漂移**：讀 `upstream-touching.diff`、`importer-sweep.txt` 與 `seam-upstream.diff`，上游改了簽章、回傳值、語意（例如回傳一個要呼叫的 release、改成會 reject）的模組，fork 的呼叫點有沒有跟上？上游新增的平行路徑（新的 switch、新的入口、重建的 options 物件）有沒有繞過 fork 的 seam？逐一打開呼叫點看，不要只看 diff。
  - **C 測試與 seam**：對**每一個**解過衝突（含 rerere 重放）或額外修正的 hunk，找到守它的測試，把該 hunk 改回上游那一側或拿掉修正，跑那個測試確認會變紅，看完 `git checkout -- .` 還原；逐項列出 hunk、測試、紅的那一行（第 6 步「合格的 MANUAL」靠這張表）。hunk 超過 10 個就開兩個 C（`review-c1`、`review-c2`）、各分一半。沒有測試會紅的 seam 就是發現，標明它是不是這次解過的 hunk。**CLEAN 時也要做**：對 `seam-upstream.diff` 碰到的每個 seam（對照 `config/fork-seam-tests.txt` 的分組），把 fork 在那個 seam 的接線拿掉一處（刪欄位轉傳、刪 `'git-graph'` case、刪 slot prop），跑那組 seam 測試確認會紅；沒有會紅的就是發現。
  - 每個都要求輸出：發現清單（BLOCKING / NON-BLOCKING、`file:line`、為什麼、怎麼證實的），最後一行 `VERDICT: ACCEPTABLE` 或 `VERDICT: NOT ACCEPTABLE`。
- Codex 兜底（獨立全面審）：照 codex 技能用 companion 的 `task`（**不要用 `review`/`adversarial-review`**：它們拿分支比預設分支，在這裡會是整串 fork 或兩條分岔歷史）。提示寫進 `$MAIN/.rebase-review/codex-prompt.md`：說明這是 fork rebase 的審查、素材在哪、四個問題（A/B/C 的問題加上「還有什麼會讓 fork 功能在 vNEW 上壞掉」）、同樣的輸出格式與 VERDICT 行。
  ```sh
  cd ../ar-$RUN-review-codex && CODEX_JOB_TIMEOUT_MS=5400000 node ~/.claude/skills/codex/scripts/codex-companion.mjs task --background --json --write --prompt-file "$MAIN/.rebase-review/codex-prompt.md" > "$MAIN/.rebase-review/codex-launch.json"
  ```
  `--write` 讓它能在自己的 worktree 做改回上游的實驗；提示檔用絕對路徑，因為指令在另一個目錄跑。等待照 codex 技能的 wait 迴圈；完成後 `result <jobId>` 存成 `.rebase-review/codex-result.md`，並記下它的 thread id（`status <jobId> --json`）。Codex 跑失敗或沒啟動成功：**不要自己代寫結果**，記為「Codex 未完成」，這次就不能自動移動 develop。

## 5. 分流與修正（最多兩輪）

- 彙整所有結果。每個 BLOCKING 自己去程式碼裡確認：
  - 確認是真的 → 修、補會變紅的測試、commit（算 MANUAL）、`git push --force fork HEAD:refs/heads/rebase/vNEW`、重跑受影響的本機測試，`gh-wait pr PR` 等 CI 綠。
  - 不同意 → 寫下理由（引用程式碼證據），原文與理由一起進 PR。
- 有修正就再審一輪：先在 `../ar-$RUN-review-codex` `git checkout --detach <新 head>`，Codex 在那裡用 `task --thread <第一輪的 thread id>` 看修正後的 diff（**不要用 `--resume-last`**：機器上別的 session 也在跑 Codex，會接錯 thread）；Claude 只開一個新的 general-purpose 審查者看修正的部分。
- 兩輪後仍有確認為真、沒修好的 BLOCKING → 不移動 develop，第 8 步回報。
- 審查結果貼成一則 PR 留言：每個審查者的 VERDICT、每個發現與處理（已修 commit / 不同意理由 / NON-BLOCKING 留待），附上 importer-sweep 裡人工確認過的「上游改了 X，fork 呼叫點 Y 已看過」。

**審查通過**的定義（第 6 步用）：每個 Claude 審查者的每個 BLOCKING 都已修好或有程式碼證據反駁，而且 Codex 最後一輪是 `VERDICT: ACCEPTABLE`。Codex 的 BLOCKING 不能只靠反駁放行：反駁後要它在同一個 thread 再看一次，它改判 ACCEPTABLE 才算。

## 6. 移動 develop

**自動移動**的條件，全部都要成立：

- (CLEAN、沒有任何修正 commit，且審查者 C 對 `seam-upstream.diff` 碰到的 seam 沒有列出「沒有測試會紅」的項目) 或 **合格的 MANUAL**（見下）；
- 本機 fork-check 與 fork-check-seams 綠（或只有附了雙邊輸出的上游既有失敗）；e2e、wire、mobile 綠（或只有第 3 步判定的 develop 既有紅測試）；
- CI 綠：「Fork PR checks passed」在目前 head 的 conclusion 是 SUCCESS，且它來自 `.github/workflows/fork-pr.yml` 的 job `verify`（`gh run list -R audichuang/orca --workflow fork-pr.yml --commit <head>` 對得上；SKIPPED、沒有這個 check、或同名 check 來自別的 workflow 都不算）；
- 第 5 步的審查通過；
- RESUME 時 PR 說明裡有 old-develop 那行。

**合格的 MANUAL**：range-diff 每個 `!` 項目與每個修正 commit 都有審查者 C（或你自己）做過的 mutation 證明——把那個 hunk 改回上游那一側或拿掉修正，指定的測試會變紅，證據（指令與紅的那一行）寫進審查留言；審查者 C 列出的「沒有測試會紅的 seam」裡，沒有一個落在這次解過衝突、rerere 重放或修正的 hunk 上，也沒有一個落在 `seam-upstream.diff` 碰到的 seam 上（不相關的既有缺口不擋，但要列進通知）。任何一項做不到就不移動。例外：「fork 自身問題」條目的修正 commit 只改 fork 自己的測試檔（`git cat-file -e vNEW:<檔>` 失敗，上游沒有這個檔）時，不需要 mutation 證明（時序類的修正改回去也不一定會紅），條目「守它的測試」在本機與 CI 都通過即可；改到產品程式碼或上游檔的照一般規則。

推的是 CI 驗過的那個 sha，不是分支名：

```sh
head=$(git rev-parse HEAD); [ "$head" = "$(git ls-remote fork refs/heads/rebase/vNEW | cut -f1)" ] || { echo "HEAD 不是 CI 驗過的 rebase/vNEW"; exit 1; }
git push fork "${OLD_DEVELOP}:refs/heads/backup/develop-vOLD-$RUN" && \
  git push --force-with-lease="develop:${OLD_DEVELOP}" fork "${head}:refs/heads/develop"
```

- lease 失敗 = 期間有 PR 合進 develop，這次的 rebase 不含它。不重試、不 force：`gh pr close PR -R audichuang/orca -c "develop 在驗證期間移動了，下一次排程重新 rebase"`，刪掉 fork 的 `rebase/vNEW` 與 `ci-base/vNEW`（下一次排程就會從新的 develop 重來），第 8 步寫筆記（這次的解法下一次還用得到）並回報。
- 成功後：馬上在 PR 留言 `<!-- auto-rebase:develop-moved ${head} -->`（PR 與 `rebase/vNEW` 都留到第 7 步結束：這時死掉，precheck 六小時後判定過期，第 0 步看到這則留言就接著發版；先收鎖的話，develop 已移動、沒有 tag，之後每小時的預檢都會安靜結束），然後 `make fork-ci-disable-upstream`。筆記在第 8 步寫：這次用掉的條目從 `known-resolutions.md` 移到 `resolution-history.md`。條目等 develop 真的移動了才移走：沒移動的話，下一次 rebase 還用得到。

移動成功就接第 7 步發版。

**其他情況不移動**（也不發版，直接第 8 步）：PR 留言寫好上面的兩條 push 指令（填實際 sha 與日期，加上「成功後」那段收尾），留言第一行放 `<!-- auto-rebase:verified -->`。`rebase/vNEW` 留著，它讓下一次排程跳過。

## 7. 發版（develop 由第 6 步移動後才做）

發的是第 6 步推上 develop 的 `$head`，也就是 CI 驗過的 `rebase/vNEW` head（`Fork PR checks passed` 在這個 sha 上綠），不必再跑 `make fork-check-full`（macOS 上上游自己的測試一定紅，不能當機器門檻；Linux 的 Fork CI 才是 gate）。

發版途中任何一步失敗（release 沒觸發、紅兩次、第 3 點的檢查或推送失敗），都照第 6 點收鎖、第 8 步回報，不要留著鎖：develop 已經移動，鎖不再保護什麼，留著只會讓 precheck 六小時後再跑一次同樣失敗的發版。

0. RESUME 發版時先看 `git ls-remote fork 'refs/tags/vNEW-fork.*'`：已有 tag 指著這個 sha（比對 `^{}` 那行；前一次 run 推完 tag 才死）→ 跳到第 4 點。
1. N：`git tag -l "vNEW-fork.*" | sed 's/.*-fork\.//' | sort -n | tail -1`，沒有就是 1，否則 +1（要數字排序，字串排序會把 fork.10 排在 fork.9 前面）。
2. 發版說明寫進檔案（中文、使用者看得到的變化）。格式照上一個 fork tag：`prev=$(git describe --tags --abbrev=0 --match 'v*-fork.*' fork/main)`、`git tag -l --format='%(contents)' "$prev"`。第一行「跟上上游 Orca vNEW，fork 功能（…）全部保留。」，接著 4–6 點整理 `gh release view vNEW -R stablyai/orca --json body` 的「The short version」，最後一點寫這次 fork 自己的修正（第 1、5 步的修正 commit 有使用者看得到的就寫，例如新語系的 fork 翻譯）。
3. 打 tag 並推（zsh：變數後接 `:` 一律寫 `${}`）：
   ```sh
   sha=<第 6 步的 head 完整 sha>; [ "$(git ls-remote fork refs/heads/develop | cut -f1)" = "$sha" ] || { echo "develop 已不是驗過的 head，不發版"; exit 1; }
   old=$(git ls-remote fork refs/heads/main | cut -f1)
   git tag -a "vNEW-fork.N" "${sha}" -F <notes 檔> && git push --atomic --force-with-lease="main:${old}" fork "${sha}:main" "vNEW-fork.N"
   ```
4. 在 PR 留言「發版開始 vNEW-fork.N」（心跳）。找這個 tag 的 release run：`gh run list -R audichuang/orca --workflow fork-release.yml --event push --limit 5 --json databaseId,headBranch --jq '.[] | select(.headBranch=="vNEW-fork.N") | .databaseId'`。剛推完可能還沒出現，查不到就先寫第 8 步的通知草稿再查，查三次都沒有就當 release 沒觸發，第 8 步回報。找到後 `gh-wait run <id> -R audichuang/orca`。「Bump the Homebrew cask」紅多半是 API 配額，`gh run rerun <id> --failed -R audichuang/orca` 一次。確認 `gh api repos/audichuang/homebrew-tap/contents/Casks/orca-fork.rb --jq .content | base64 -d` 的 version 是新版。release 紅兩次 → 不升級，第 8 步回報（tag 已推不刪；修好後重跑 workflow 即可）。
5. MacBook：`ssh macbookpro "bash -lc 'export PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:\$PATH; pgrep -f \"Orca Fork.app\" >/dev/null && echo RUNNING || { brew update >/dev/null; brew upgrade --cask orca-fork; }'"`。印 RUNNING 就不升級（不幫使用者關 app），通知裡請使用者自己升級。
6. 收鎖與收尾：`gh pr close PR -R audichuang/orca -c "<發版結果：vNEW-fork.N 已發佈，或失敗在哪>"`，刪 fork 的 `rebase/vNEW` 與 `ci-base/vNEW`；`git worktree remove --force` 這次的 `../ar-$RUN-*`（先確認沒有你要留給使用者看的東西）；`MAIN` 由 Orca 管理，留給下一次 run 清。回滾不由這個技能做（develop 這時還指著壞的 commit，第 3 點的檢查會擋下）：在通知裡寫出上一個好的 commit，讓使用者照 FORK.md「Release」把它打成 `vNEW-fork.(N+1)` 推上去。

## 8. Bark 通知（不論結果都推）

先處理鎖：凡是保留 `rebase/vNEW` 給人看或接手的結局（第 1 步 rebase 放棄、第 2、3、5 步的失敗、第 4 步素材產生失敗、不移動 develop），還沒有 PR 就開：fork 上沒有 `ci-base/vNEW` 就先 `git push fork "vNEW^{commit}:refs/heads/ci-base/vNEW"`，然後照第 1 步第 7 點的 `gh pr create`（body 含 old-develop 那行）（第 1 步放棄的不要把 HEAD 推上去蓋掉鎖，PR 說明寫明失敗在哪、卡在哪個檔），再留言 `<!-- auto-rebase:needs-human -->`（第 6 步「其他情況不移動」已留 verified 的不用再留）。沒有這兩種留言，precheck 六小時後會判定鎖過期，把分支刪掉重跑，使用者接手的東西就沒了。

**寫筆記（不論結果都寫，Bark 之前做）**：使用者不會照通知去處理，下一次 run 只能靠筆記知道之前怎麼做的。重新 `tip=$(config/scripts/fork-notes.sh tip)`，`git show` 出兩份副本：

- `resolution-history.md`（處理紀錄，只增不刪）：最上面加一條 `## <YYYY-MM-DD> auto-rebase vOLD → vNEW（PR #N）— <develop 已移動並發 vNEW-fork.N｜沒移動：原因>`，列出：每個衝突檔怎麼解、守它的測試（mutation 證據的那一行）；用掉的 `known-resolutions.md` 條目整段搬過來並註明「照做／跟眼前不符改怎麼做」；確認為真的審查發現與修法；沒移動或發版失敗時卡在哪、下一次要怎麼做。
- `known-resolutions.md`：develop 移動了才刪掉用掉的條目（已搬進紀錄）。沒移動、而且這次有自己解出來的衝突或修正，就照檔頭範本補條目（上游 commit 填 `git log -1 --format=%H vOLD..vNEW -- <衝突檔>`），讓下一次 rebase 或 canary 直接用；卡住的寫「待人判斷」與已知事實。

`config/scripts/fork-notes.sh write "$tip" "auto-rebase vNEW: <結果>" known-resolutions.md=<副本> resolution-history.md=<副本>`。exit 2 表示 canary 剛寫過：重新 `tip`、在新版上套同樣的改動再寫一次；還是 exit 2 或其他非 0 就不再試，在通知裡註明筆記沒寫成、該怎麼改。

組內容與送出**在同一個 Bash 指令裡**（每次 Bash 是新 shell；送空內容 Bark 也回 200）：

```
doppler run -p shioaji -c dev -- uv run --no-project python - <<'PY'
import json, os, sys, urllib.request
title = "Orca fork rebase vNEW：<已移動 develop｜等你審 PR #N｜失敗：哪一步>"
body = """（多行內容）"""
payload = json.dumps({"title": title, "body": body, "group": "orca"}, ensure_ascii=False).encode("utf-8")
if not title.strip() or not body.strip():
    sys.exit("推播內容是空的，不送")
req = urllib.request.Request(os.environ["BARK_URL"], data=payload, headers={"Content-Type": "application/json; charset=utf-8"})
resp = json.load(urllib.request.urlopen(req, timeout=15))
print("bark:", resp)
sys.exit(0 if resp.get("code") == 200 else 1)
PY
```

body 控制在約 1,200 字內：vOLD → vNEW、CLEAN/MANUAL、衝突與修正各一句、本機 / CI / e2e 結果、每個審查者的 VERDICT 與確認為真的發現數、PR 連結、develop 有沒有移動（沒移動就寫原因，例如 lease 失敗）。再加：

- 發版結果：tag、release 連結、MacBook 有沒有升級（Orca 開著就寫「請自己 `brew upgrade --cask orca-fork` 後重開」）；沒發版就寫原因。
- CI 有自動重跑的 job 寫出名稱；審查者 C 列出、但不擋這次的既有測試缺口列出來；第 0 步沒刪的 worktree；筆記沒寫成的話寫原因。
- develop 有移動時列出對 develop 開著的 PR（`gh pr list -R audichuang/orca --base develop`），它們要重跑 CI 才能合。

最後在對話裡印出和 Bark 一樣的內容。

## 限制

- 不 push `origin`；`main` 與 tag 只在第 7 步動。
- 除了第 6 步那一次 lease 推送，不 force push `develop`；不刪 `backup/*`。`fork-canary-notes` 只經 `config/scripts/fork-notes.sh` 寫，不 force。
- 不動 `~/Project/orca` 主 checkout；暫時 worktree 只用 `../ar-$RUN-*`，用完刪。
- 不改使用者的 app 設定；不開看得見的 Orca 視窗、不搶焦點（AGENTS.md 的 `ORCA_BACKGROUND_LAUNCH=1`）。
