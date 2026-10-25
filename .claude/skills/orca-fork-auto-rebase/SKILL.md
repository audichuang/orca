---
name: orca-fork-auto-rebase
description: Unattended pipeline that rebases the Orca fork's develop onto the newest upstream release tag, verifies it (local fork-check, fork CI, fork e2e, three blind Claude reviewers plus a Codex backstop), then moves develop and releases when the gates pass, or leaves a PR for the user. Use when the "Orca fork 自動 rebase" Orca automation fires, or when the user asks to run or resume that pipeline.
---

# Orca fork 自動 rebase

無人值守：沒有人會回答問題，不要停下來問。repo 是 audichuang/orca（remote `fork`），上游 stablyai/orca（remote `origin`）。規則來源是 `git show fork/develop:FORK.md` 的 Merge gate 與 Release 兩節，先讀；這裡沒寫的照它。

本技能覆寫兩個預設：codex 技能的「找到問題不自動修、停下來問」在這裡不適用（第 5 步規定怎麼修）；`orca-lcu-ui-test` 與 Codex desktop 的真實 UI 測試輪**不在這裡跑**——它們會占用螢幕鍵盤剪貼簿，排程隨時會觸發。發版前要驗的 UI 情境（ClipCode 複製、Paste & Restore、資料夾 repo 清單、session restore、external-change banner、agent launch cwd）由 fork e2e 在隱藏視窗驗（`folder-multi-repo-source-control.spec.ts`、`folder-workspace-tab-restart-restore.spec.ts`），第 3 步的 `fork-check-e2e` 與 CI 都會跑；lcu 實機輪只留給新增或改了 UI 的功能 PR。

`SKILL_DIR` = 這個 SKILL.md 所在目錄。所有 gh 呼叫間隔放寬（API 配額與 release workflow 共用）。

## 0. 決定模式

```sh
git fetch fork && git fetch origin --no-tags '+refs/tags/v*:refs/tags/v*'
```
- vNEW = 上游最新**已發布的 GitHub Release**：`gh api repos/stablyai/orca/releases/latest --jq .tag_name`（須符合 `^v[0-9]+\.[0-9]+\.[0-9]+$`）。上游也會推從沒發布成 Release 的 tag（例如 v1.4.236），那些不算，不要用 `git ls-remote` 取最大 tag。
- vOLD = `git describe --tags --abbrev=0 --match 'v[0-9]*.[0-9]*.[0-9]*' --exclude '*-fork*' fork/develop`；OLD_DEVELOP = `git rev-parse fork/develop`。
- fork 上已有 `rebase/vX` 分支：
  - 它對 `ci-base/vX` 的 PR 還開著、沒有含 `<!-- auto-rebase:verified -->` 的留言 → **RESUME**：`git checkout --detach fork/rebase/vX`，vNEW=vX，從第 2 步開始。CLEAN/MANUAL 依 PR 說明（說明有手動解衝突或額外 commit 就是 MANUAL）。
  - PR 開著、已有 verified 留言（等人審）→ 結束，不推通知。
  - 沒有開著的 PR（前一次 run 在開 PR 前就死了，預檢判定鎖已過期才會讓你跑到這）→ `git push fork --delete rebase/vX ci-base/vX`（後者不存在就略過），當成 **NEW** 重來。
- 沒有 `rebase/*` 且 vNEW == vOLD → 結束，不推通知。
- 否則 **NEW**，從第 1 步開始。

開始前先清掉之前 run 留下的 worktree（狀態都在 fork 上，本機的不需要）：`git worktree list` 裡路徑含 `auto-orca-fork-rebase-run-` 而且不是目前這個的，逐一 `orca worktree rm --worktree "id:622b02e4-f394-4c0d-a683-b027f426796b::<路徑>" --force --json`。

一律在目前這個 worktree 做（Orca 為這次 run 開的），不要動 `~/Project/orca` 主 checkout。**全程用 detached HEAD，推送寫明目的地**（`git push fork HEAD:refs/heads/rebase/vNEW`）：前一次 run 的 worktree 可能還 checkout 著 `rebase/vNEW`，`checkout -B` 會失敗。

## 1. Rebase（NEW）

- `git checkout --detach fork/develop && git rebase --onto vNEW vOLD`（FORK.md 說明為何要 --onto）。rerere 已開；重放後仍要 `git add` 才能 continue。
- 開始前讀筆記：`tip=$(config/scripts/fork-notes.sh tip) && git show "$tip":known-resolutions.md`。每日 canary（`make fork-canary`，對上游 main 試合）事先看過的衝突與「該丟掉的 fork commit」記在那裡。照它處理，處理過的條目在 PR 說明裡逐條列出；它跟眼前的衝突對不上就以眼前為準，並在通知裡註明。這次 vNEW 已含的條目處理完後刪掉：把檔案存成本機副本、刪掉那幾條，`config/scripts/fork-notes.sh write "$tip" "auto-rebase vNEW: drop consumed entries" known-resolutions.md=<副本>`；exit 2 表示 canary 剛寫過，重新 `tip`、在新版上刪同樣的條目再寫。`fork-notes.sh` 是 fork 自己的檔案，rebase 中途可能還沒重放回工作樹：在 `git checkout --detach fork/develop` 之後、rebase 之前讀，rebase 完成後再刪。
- CLEAN = 完全沒衝突、也沒丟 commit；MANUAL = 有任何衝突（**rerere 自動重放的也算**：那是對舊上游錄下的解法，要跟自己解的一樣過 mutation 證明）、丟掉了 commit、或有額外修正 commit。
- 自己解：保留 fork 功能、採上游新結構（FORK.md 的 seam 原則）；locale 兩邊 key 都保留，之後 `pnpm run verify:localization-catalogs`。沒把握就 `git rebase --abort`，跳到第 8 步回報失敗。
- rebase 一完成就先 `git push --force fork HEAD:refs/heads/rebase/vNEW` 當鎖：precheck 看到任何 `rebase/*` 就跳過，不先推的話，第 2 步跑超過一小時時下一次排程會重複開一輪。
- `make fork-check-lint` 直接讀 `package.json` 的 `"lint"` 逐項執行（`config/scripts/fork-lint-run.mjs`），上游增減 lint 項目不用手動同步。只有兩種情況要動它，另外 commit（算 MANUAL）：上游拿掉了 `EXCLUDED` 裡的項目（腳本會報錯要你刪掉那筆排除），或 `lint` script 出現它拒絕的寫法（換行、管線等 shell 語法）。
- 所有 commit：message 英文，結尾 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。

## 2. 本機閘門（一律跑，不分 CLEAN/MANUAL）

`pnpm install --frozen-lockfile`，然後 `make fork-check`，再 `make fork-check-seams`（`config/fork-seam-tests.txt` 列的 fork seam contract 測試，一個不漏地跑；沒有這個 target 的舊 develop 就略過並註明）。`make fork-footprint` 的輸出貼進 PR 說明（fork 在上游檔案上的足跡，跟上一次 rebase 比）。

macOS 上 `fork-check-tests` 會連上游自己的測試一起報紅（`orca-runtime.test.ts` 的 `/var` 對 `/private/var`，CI 的 Linux 上會過）；只有這種的不算回歸，失敗清單照貼進 PR。其他 vitest 失敗照下面處理。

**失敗處理（新的 vitest 失敗、第 3 步的 e2e）**：在乾淨的上游 worktree 重現同一個檔案或 shard：
```sh
git worktree add --detach ../base-vNEW vNEW && (cd ../base-vNEW && pnpm install --frozen-lockfile && <同一條測試指令>)
```
只有「fork 失敗、上游通過」才算回歸，要修（修正 commit 算 MANUAL）。兩邊都失敗才可排除，而且**兩份輸出的尾段都要貼進 PR**，沒貼不准排除。同一個問題修兩輪還不過 → 第 8 步回報，分支照推讓使用者接手。

## 3. 推上去：fork CI 與 e2e 並行

- `git push fork vNEW:refs/heads/ci-base/vNEW`；`git push --force fork HEAD:refs/heads/rebase/vNEW`。
- PR：`gh pr create -R audichuang/orca --base ci-base/vNEW --head rebase/vNEW --title "[不合併] develop rebase 到 vNEW 的 CI 驗證"`。body 照 PR #22/#29 的格式（不合併的原因、`develop = vOLD + N 個 fork commit` → `vNEW + …` diff 區塊、每個衝突檔怎麼解、額外 commit、Merge Danger），結尾 `🤖 Generated with [Claude Code](https://claude.com/claude-code)`。RESUME 時沿用既有 PR。
- 等 CI 的同時跑 e2e（本機）：
  1. `make fork-check-e2e FORK_BASE=vNEW`：跟 CI 同一個 target，選 spec 的方式一樣（folder spec 加上 fork 新增或改過的 e2e），開跑前會先等 1 分鐘 load 降到核心數以下，最多等 10 分鐘；仍高照跑，但結果註明負載。
  2. 失敗 → 先在負載降下來時重跑一次，再照第 2 步的失敗處理對照：spec 在 vNEW 存在就在 vNEW 跑；是 fork 自己的 spec（上游沒有）就在 OLD_DEVELOP 跑。舊 develop 上也失敗 = fork 既有問題，不擋這次 rebase，但要在通知裡列為「develop 既有紅測試」。
  3. 接著 `make fork-check-wire fork-check-mobile`（CI 的跨版本 wire 與 mobile web app 兩個 job，約 4 分鐘）。失敗照第 2 點對照 vNEW。
- CI：`gh run list -R audichuang/orca --workflow fork-pr.yml --commit <head> --limit 1 --json databaseId` 取 run id，`gh-wait run <id> -R audichuang/orca` 等完（不要用 `gh pr checks --watch` 或 `gh run watch`），看「Fork PR checks passed」。有 job 紅：先 `gh run rerun <id> --failed -R audichuang/orca` **自動重跑一次**再 `gh-wait`（偶發失敗，例如會讀剪貼簿的 e2e，在 CI 層重跑；fork-check 目標裡不加任何豁免）。同一個 job 第二次還紅才算真的失敗：看 `gh run view --log-failed`，照第 2 步的規則處理；fork e2e 失敗另外照 FORK.md「When a fork e2e goes red」下載 artifact 看 `shots/`。重跑過的 job 在第 8 步的通知裡註明。
- e2e、wire、mobile 的結果（通過數、失敗與對照）貼成 PR 留言。

## 4. 盲審（本機、CI、e2e 都綠才做；不審紅的 build）

產生審查素材：
```sh
bash "$SKILL_DIR/scripts/review-bundle.sh" vOLD OLD_DEVELOP vNEW HEAD "$PWD/.rebase-review"
```
（`.rebase-review/` 不要 commit。）裡面有 `range-diff.txt`、`extra-commits.diff`、`upstream-touching.diff`、`importer-sweep.txt`、`seam-upstream.diff`、`README.txt`。`seam-upstream.diff` 是上游 vOLD..vNEW 對「fork 改過的上游檔、fork 新檔 import 的上游模組、含 fork seam 關鍵字的檔」的改動，**CLEAN 時它就是審查的主體**：沒有文字衝突不代表上游沒有新增一條繞過 fork seam 的平行路徑（新的 content type switch 沒有 `'git-graph'`、新的 updater 入口沒有 `isForkDistribution()`、重組參數時丟了 `skipRenderLimit`、slot 不再被渲染）。

**會改檔的審查者（C 與 Codex）各用一個自己的 worktree**：`git worktree add --detach ../review-<名字> HEAD && (cd ../review-<名字> && pnpm install --frozen-lockfile)`，否則改回上游那一側的實驗會污染其他人正在讀的樹；A、B 用目前的 worktree 唯讀。

**同時**開四個審查者，每個只拿這個資料夾路徑與（自己的）worktree 路徑，**不給 PR 說明、不給你的解衝突理由**（盲審：讓他們自己判斷，不被你的敘述帶著走）：

- 三個 Claude：用 Agent 工具，`subagent_type: general-purpose`（不要用 fork，fork 會繼承你的脈絡），各一個角度：
  - **A 衝突忠實度**：`range-diff.txt` 每個 `!` 項目，新版是否保留 fork 原本的行為、同時採用上游的新結構？有沒有 fork 的欄位、分支、呼叫被默默丟掉？
  - **B 上游 API 漂移**：讀 `upstream-touching.diff`、`importer-sweep.txt` 與 `seam-upstream.diff`，上游改了簽章、回傳值、語意（例如回傳一個要呼叫的 release、改成會 reject）的模組，fork 的呼叫點有沒有跟上？上游新增的平行路徑（新的 switch、新的入口、重建的 options 物件）有沒有繞過 fork 的 seam？逐一打開呼叫點看，不要只看 diff。
  - **C 測試與 seam**：對**每一個**解過衝突（含 rerere 重放）或額外修正的 hunk，找到守它的測試，把該 hunk 改回上游那一側或拿掉修正，跑那個測試確認會變紅，看完 `git checkout -- .` 還原；逐項列出 hunk、測試、紅的那一行（第 6 步「合格的 MANUAL」靠這張表）。hunk 超過 10 個就開兩個 C、各分一半。沒有測試會紅的 seam 就是發現，標明它是不是這次解過的 hunk。**CLEAN 時也要做**：對 `seam-upstream.diff` 碰到的每個 seam（對照 `config/fork-seam-tests.txt` 的分組），把 fork 在那個 seam 的接線拿掉一處（刪欄位轉傳、刪 `'git-graph'` case、刪 slot prop），跑那組 seam 測試確認會紅；沒有會紅的就是發現。
  - 每個都要求輸出：發現清單（BLOCKING / NON-BLOCKING、`file:line`、為什麼、怎麼證實的），最後一行 `VERDICT: ACCEPTABLE` 或 `VERDICT: NOT ACCEPTABLE`。
- Codex 兜底（獨立全面審）：照 codex 技能用 companion 的 `task`（**不要用 `review`/`adversarial-review`**：它們拿分支比預設分支，在這裡會是整串 fork 或兩條分岔歷史）。把提示寫進檔案：說明這是 fork rebase 的審查、素材在哪、四個問題（A/B/C 的問題加上「還有什麼會讓 fork 功能在 vNEW 上壞掉」）、同樣的輸出格式與 VERDICT 行。
  ```sh
  cd ../review-codex && CODEX_JOB_TIMEOUT_MS=5400000 node ~/.claude/skills/codex/scripts/codex-companion.mjs task --background --json --prompt-file <file> > <主 worktree>/.rebase-review/codex-launch.json
  ```
  等待照 codex 技能的 wait 迴圈；完成後 `result <jobId>` 存成 `.rebase-review/codex-result.md`，並記下它的 thread id（`status <jobId> --json`）。Codex 跑失敗或沒啟動成功：**不要自己代寫結果**，記為「Codex 未完成」，這次就不能自動移動 develop。

## 5. 分流與修正（最多兩輪）

- 彙整四份結果。每個 BLOCKING 自己去程式碼裡確認：
  - 確認是真的 → 修、補會變紅的測試、commit（算 MANUAL）、`push`、重跑受影響的本機測試，等 CI 綠。
  - 不同意 → 寫下理由（引用程式碼證據），原文與理由一起進 PR。
- 有修正就再審一輪：Codex 在 `../review-codex` 用 `task --thread <第一輪的 thread id>` 看修正後的 diff（**不要用 `--resume-last`**：機器上別的 session 也在跑 Codex，會接錯 thread）；Claude 只開一個新的 general-purpose 審查者看修正的部分。
- 兩輪後仍有確認為真、沒修好的 BLOCKING → 不移動 develop，第 8 步回報。
- 審查結果貼成一則 PR 留言：每個審查者的 VERDICT、每個發現與處理（已修 commit / 不同意理由 / NON-BLOCKING 留待），附上 importer-sweep 裡人工確認過的「上游改了 X，fork 呼叫點 Y 已看過」。

## 6. 移動 develop

**自動移動**的條件，全部都要成立：(CLEAN、沒有任何修正 commit，且審查者 C 對 `seam-upstream.diff` 碰到的 seam 沒有列出「沒有測試會紅」的項目) 或 **合格的 MANUAL**（見下）、本機 fork-check 與 fork-check-seams 綠（或只有附了雙邊輸出的上游既有失敗）、CI 綠（「Fork PR checks passed」在目前 head 的 conclusion 是 SUCCESS，且它來自 `.github/workflows/fork-pr.yml` 的 job `verify`：`gh run list -R audichuang/orca --workflow fork-pr.yml --commit <head>` 對得上；SKIPPED、沒有這個 check、或同名 check 來自別的 workflow 都不算）、e2e 綠、四個審查者都是 ACCEPTABLE、Codex 有完成。
```sh
git push fork OLD_DEVELOP:refs/heads/backup/develop-vOLD-$(date +%F)
git push --force-with-lease=develop:OLD_DEVELOP fork rebase/vNEW:develop
```
**合格的 MANUAL**：range-diff 每個 `!` 項目與每個修正 commit 都有審查者 C（或你自己）做過的 mutation 證明——把那個 hunk 改回上游那一側或拿掉修正，指定的測試會變紅，證據（指令與紅的那一行）寫進審查留言；四個審查者沒有確認為真的 BLOCKING；審查者 C 列出的「沒有測試會紅的 seam」裡，沒有一個落在這次解過衝突、rerere 重放或修正的 hunk 上，也沒有一個落在 `seam-upstream.diff` 碰到的 seam 上（不相關的既有缺口不擋，但要列進通知）。任何一項做不到就不移動。

lease 失敗 = 期間有 PR 合進 develop：不重試、不 force，第 8 步回報。成功後：`gh pr close <PR> -c "全部驗證通過，develop 已移到這個分支"`、刪除 fork 的 `ci-base/vNEW` 與 `rebase/vNEW`、`make fork-ci-disable-upstream`。

移動成功就接第 7 步發版。

**其他情況不移動**（也不發版，直接第 8 步）：PR 留言寫好上面三條指令（填實際 sha 與日期，加上收尾那一行），留言第一行放 `<!-- auto-rebase:verified -->`。`rebase/vNEW` 留著，它讓下一次排程跳過。

## 7. 發版（develop 由第 6 步移動後才做）

develop 移動後的 commit 就是 CI 驗過的 `rebase/vNEW` head（`Fork PR checks passed` 在這個 sha 上綠），不必再跑 `make fork-check-full`（macOS 上上游自己的測試一定紅，不能當機器門檻；Linux 的 Fork CI 才是 gate）。

1. N：`git tag -l "vNEW-fork.*"` 沒有就是 1，否則最大值 +1。
2. 發版說明寫進檔案（中文、使用者看得到的變化，格式照前一個 tag：`git tag -l --format='%(contents)' <上一個 fork tag>`）：第一行「跟上上游 Orca vNEW，fork 功能（…）全部保留。」，接著 4–6 點整理 `gh release view vNEW -R stablyai/orca --json body` 的「The short version」，最後一點寫這次 fork 自己的修正（第 1、5 步的修正 commit 有使用者看得到的就寫，例如新語系的 fork 翻譯）。
3. 打 tag 並推（zsh：變數後接 `:` 一律寫 `${}`）：
   ```sh
   sha=$(git rev-parse fork/develop); old=$(git ls-remote fork refs/heads/main | cut -f1)
   git tag -a "vNEW-fork.N" "${sha}" -F <notes 檔> && git push --atomic --force-with-lease="main:${old}" fork "${sha}:main" "vNEW-fork.N"
   ```
4. `gh run list -R audichuang/orca --workflow fork-release.yml --limit 1 --json databaseId,headBranch` 取這個 tag 的 run，`gh-wait run <id> -R audichuang/orca`。「Bump the Homebrew cask」紅多半是 API 配額，`gh run rerun <id> --failed` 一次。確認 `gh api repos/audichuang/homebrew-tap/contents/Casks/orca-fork.rb --jq .content | base64 -d` 的 version 是新版。release 紅兩次 → 不升級，第 8 步回報（tag 已推不刪；修好後重跑 workflow 即可）。
5. MacBook：`ssh macbookpro "bash -lc 'export PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:\$PATH; pgrep -f \"Orca Fork.app\" >/dev/null && echo RUNNING || { brew update >/dev/null; brew upgrade --cask orca-fork; }'"`。印 RUNNING 就不升級（不幫使用者關 app），通知裡請使用者自己升級。
6. 收尾照 CLAUDE.local.md「發版收尾」第 3 點清 worktree 與分支。回滾：把上一個好的 commit 打成 `vNEW-fork.(N+1)` 照第 3 步推。

## 8. Bark 通知（不論結果都推）

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
body 控制在約 1,200 字內：vOLD → vNEW、CLEAN/MANUAL、衝突與修正各一句、本機 / CI / e2e 結果、四個審查者的 VERDICT 與確認為真的發現數、PR 連結、develop 有沒有移動。再加：
- 發版結果：tag、release 連結、MacBook 有沒有升級（Orca 開著就寫「請自己 `brew upgrade --cask orca-fork` 後重開」）；沒發版就寫原因。
- CI 有自動重跑的 job 寫出名稱；審查者 C 列出、但不擋這次的既有測試缺口列出來。
- develop 有移動時列出對 develop 開著的 PR（`gh pr list -R audichuang/orca --base develop`），它們要重跑 CI 才能合。

## 限制

- 不 push `origin`；`main` 與 tag 只在第 7 步動。
- 除了第 6 步那一次 lease 推送，不 force push `develop`；不刪 `backup/*`。
- 不動 `~/Project/orca` 主 checkout；`../base-vNEW`、`../review-*` 之類的暫時 worktree 用完 `git worktree remove --force`。
- 不改使用者的 app 設定；不開看得見的 Orca 視窗、不搶焦點（AGENTS.md 的 `ORCA_BACKGROUND_LAUNCH=1`）。
