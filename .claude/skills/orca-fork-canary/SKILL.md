---
name: orca-fork-canary
description: Daily unattended trial merge of the Orca fork's develop into upstream main (`make fork-canary`) that diagnoses new conflicts and failing fork tests, records their resolutions on the fork-canary-notes branch for the auto-rebase, and sends a Bark notice only when something changed. Use when the "Orca fork canary" Orca automation fires or the user asks to run the canary.
---

# Orca fork canary

無人值守：沒有人會回答問題，不要停下來問。repo 是 audichuang/orca（remote `fork`），上游 stablyai/orca（remote `origin`）。這個技能只產出報告與筆記，能動什麼見文末「限制」。

目的：上游幾乎每天發一版。canary 先對上游 `main` 試合，讓下一次 `orca-fork-auto-rebase` 開跑時，衝突與該丟的 fork commit 已經查清楚、寫在筆記分支 `fork-canary-notes` 的 `known-resolutions.md`（跟 develop 沒有共同歷史，不跑 CI、不會被 rebase 改寫）。

**等待一律在前景，絕不結束這一輪去等完成通知**：你看起來閒置，Orca 會把這次 run 判成完成，並可能關掉 terminal 連背景工作一起殺掉（auto-rebase run 121 就這樣死掉）。超過幾分鐘的指令（canary、`pnpm tc`、重跑測試、lint）用 run_in_background 跑 `<指令> > LOG 2>&1; echo $? > LOG.exit`（LOG 每次用新名字，放 `$S`），再在前景重複 `bash "$MAIN/config/scripts/fork-wait-for-job.sh" LOG.exit` 直到它回 0（回 3 是還在跑，再呼叫一次）。Bash 預設 timeout 只有 2 分鐘，超過一樣會被移到背景：**每個等待的 Bash 呼叫都要傳 `timeout: 600000`**。連續兩次回 3 而 LOG 都沒變大、`pgrep -f` 也找不到那個指令 → 它被殺了，換新 LOG 名重跑一次。

本文的變數：`MAIN` = Orca 為這次 run 開的 worktree（`pwd -P`，開頭記下）；`S` = 這次的暫存目錄（`S=$(mktemp -d)`）；`OUT` = `$HOME/.cache/orca-fork-canary`（報告放在 run worktree 外，下一次 run 清掉舊 worktree 後，筆記與通知裡的報告路徑仍然有效）。

## 1. 準備並跑 canary

1. 清掉之前 run 留下的 worktree：`git worktree list` 裡路徑含 `auto-orca-fork-canary-run-` 而且不是 `MAIN` 的，逐一 `orca worktree rm --worktree "id:622b02e4-f394-4c0d-a683-b027f426796b::<路徑>" --force --json`（只刪這種）。canary 從不改 run worktree，所以只刪 `git -C <路徑> status --porcelain`（含未追蹤檔）沒有輸出、而且 `git -C <路徑> branch -r --contains HEAD` 列得出 `fork/` 分支的；其他的是有人接手在用，不刪，列進通知。
2. 取筆記（後面每一步都用這三份副本，原始那份留著比對）：
   ```sh
   tip=$(config/scripts/fork-notes.sh tip)
   git show "${tip}:known-resolutions.md" > "$S/known-resolutions.orig.md" && cp "$S/known-resolutions.orig.md" "$S/known-resolutions.md"
   git show "${tip}:canary-last.json" > "$S/canary-last.orig.json"
   git show "${tip}:resolution-history.md" > "$S/resolution-history.md" || : > "$S/resolution-history.md"
   ```
   `fork-notes.sh` 回 0 以外的值（分支不見、網路斷）→ 照跑 canary，但第 4 步不寫回筆記，通知裡寫原因。
3. 在 `MAIN` 跑（不要動 `~/Project/orca` 主 checkout）：
   ```sh
   git fetch -q fork && git fetch -q origin main --tags
   git checkout -q --detach fork/develop
   pnpm install --frozen-lockfile
   CANARY_KEEP=1 CANARY_OUT="$OUT" make fork-canary > "$S/canary.out" 2>&1; echo $? > "$S/canary.exit"
   ```
   - 用 `make`：它會帶入 `FORK_BASE` 與 `UPSTREAM_REMOTE`。直接呼叫 `config/scripts/fork-canary.sh` 少了這兩個變數，會 setup error（exit 3）。
   - `CANARY_KEEP=1` 留下合併好的 worktree，第 2、3 步要在裡面套用解法、驗證。不要為了驗證重跑一次 canary。
   - 要跑十幾分鐘（typecheck、一百多個 fork 測試檔、上游的 lint），照開頭「等待」的方式跑、等 `$S/canary.exit`。
4. 讀結果。`make` 會把腳本的 exit code 換成自己的，所以看報告。報告目錄取自這次的輸出，不讀共用的 `latest.txt`（另一個 canary 可能剛好更新它）：`$S/canary.out` 的 `>> report: <路徑>/report.md (exit N)` 那行，`R` = 那個路徑去掉 `/report.md`。`$R/report.md` 的 `Result:` 行是 green / not green / setup error。`$S/canary.out` 裡 `>> kept canary worktree <路徑>; remove it with …` 那行，分號前面是留下的 worktree（下稱 `K`）。
   - **setup error**，或 `$S/canary.out` 沒有 `>> report:` 那行（`make` 的前置檢查在腳本開跑前就失敗了，沒有新報告）：跳到「4. 通知、存摘要、收尾」，通知寫報告的訊息或 `$S/canary.out` 的最後幾行。
   - **green**：跳到「4. 通知、存摘要、收尾」。

## 2. 歸因：哪些是同一件事

報告裡衝突的檔案會被重設成上游版本，所以很多 typecheck 錯誤和失敗測試只是**衝突的連帶症狀**，不是獨立的問題。先歸因，再診斷：

1. 對每個衝突檔，先看 `$S/known-resolutions.md` 有沒有條目。有就照它做；沒有就先在 `$S/resolution-history.md`（之前的 auto-rebase 與人工處理怎麼解的，只讀）找同一個檔或同一個 fork commit 的前例，照前例的做法，再照第 3 步判斷怎麼合。腳本已把衝突檔重設成上游那一側、清掉了衝突標記，要重建衝突時在 `K` 裡（合併還沒 commit，`MERGE_HEAD` 還在）：
   ```sh
   b=$(git merge-base HEAD MERGE_HEAD)
   git show "$b:<檔>" > "$S/base"; git show "HEAD:<檔>" > "$S/ours"; git show "MERGE_HEAD:<檔>" > "$S/theirs"
   git merge-file -p "$S/ours" "$S/base" "$S/theirs" > <檔>
   ```
   ours 是上游 main，theirs 是 fork。把解法都套進 `K`。**不要在 `K` commit，也不要跑 `git rerere`**：rerere 的紀錄跨 worktree 共用，這裡對上游 main 解的結果會被下一次 auto-rebase 自動重放。
2. 在 `K` 跑 `pnpm tc`，再重跑一次 canary 跑過的那批測試檔：

   ```sh
   node config/scripts/ensure-native-runtime.mjs --runtime=node
   python3 -c "import json,sys;print('\n'.join(sorted({r['name'] for r in json.load(open(sys.argv[1]))['testResults']})))" "$R/logs/vitest.json" \
     | xargs env LC_ALL=C ORCA_BACKGROUND_LAUNCH=1 pnpm exec vitest run --config config/vitest.config.ts
   ```

   locale 檔兩邊只新增 key 時由 `fork-merge-driver-install.mjs` 登記的 driver 合好，不會出現在衝突清單；出現就代表兩邊改了同一個字串。有 locale 衝突時再跑 `pnpm run verify:localization-catalogs` 與 `node config/scripts/fork-locale-parity.mjs HEAD`。parity 的基底要用 `HEAD`（`K` 的 HEAD 是上游 main），不要用 `FORK_BASE` 或 `make fork-check-lint`：舊 tag 當基底時，上游 main 新加、只放進 en.json 的 key 也會被算成 fork key，報出其他 locale「缺 key」的誤報。
   `$R/logs/vitest.json` 不存在（報告寫 install 或 test listing 失敗，測試根本沒跑）→ 只跑 `pnpm tc`，測試那部分在通知裡寫「未驗證」。

3. 套上解法就消失的 typecheck 錯誤和失敗測試，歸到那個衝突的條目。剩下的才是獨立問題，各自是一個根因。
4. 報告的「Lint failures」列出在合併樹紅的上游 lint 步驟（細節在 `$R/logs/lint.log`）。每一步在 `K` 用 log 裡 `>> pnpm …` 那條指令重跑確認，再看它點名的檔是誰的：全是 fork 改過或新增的（`git -C "$K" diff --name-only "$(git -C "$K" merge-base HEAD MERGE_HEAD)" MERGE_HEAD` 列得出）→ 多半是上游新加的 ratchet 抓到 fork 的檔；有 fork 沒碰過的上游檔 → 上游自己的紅，條目寫「上游自己就紅」與上游之後修好它的 commit（有的話），auto-rebase 會 cherry-pick 它。fork 的情況（baseline 要列 fork 檔、fork 的型別錯誤），照 FORK.md 的做法寫怎麼修（例：`config/*-baseline.txt` 只插入 fork 的行、不重排上游行）。一個 lint 步驟一條，類型多半是「上游改了 fork 依賴的 API」。

例：2026-10-25 那次有 7 個衝突檔、6 個 typecheck 錯誤檔、7 個失敗測試檔，歸因後是 5 個根因，只有 1 個是新的（上游 revert #32320，撞到 fork 在同一段的改動）。

**哪些要診斷**：看 `known-resolutions.orig.md` 有沒有條目，不看上一次的摘要。原因：上游一發版，auto-rebase 處理完就會把條目搬進 `resolution-history.md`，但上游 main 可能還帶著同樣的衝突。這時只跟摘要比，會以為「不是新的」而跳過，處理方法就沒人記了。第一次跑、還沒有摘要時也一樣。

## 3. 診斷沒有條目的根因，寫進 known-resolutions.md

- 看報告列的上游 commit 與 fork commit（`git show <sha>`），判斷是哪一種：
  - **上游修了同一件事**（像 078ffe8487 被上游 #6282 取代）→ 建議丟掉那個 fork commit，列出要一起刪的 fork 測試與常數。
  - **兩邊各改各的** → 寫清楚怎麼合（採上游結構，再把 fork 的哪幾行加回），以及守它的測試（`config/fork-seam-tests.txt` 裡的哪一組）。上游 revert 一個 fork 也有改到的功能，也算這一種：fork 的行加回，被上游刪掉的東西不要加回來。
  - **上游改了 fork 依賴的 API**（改名、刪 export、改簽章）→ 寫 fork 這邊要怎麼跟上。
  - **fork 自身問題**（跟上游哪一版無關，develop 現在就壞或不穩，例如 fork 測試的時序）→ 寫清楚怎麼改、哪個測試守它。標題的上游 commit 位置寫「fork 自身問題」：沒有上游 sha，下一次 auto-rebase 不論 vNEW 是哪一版都會在 rebase 後照它改，不必等人處理。條目列的修正已經在 develop 上（有人先改了）就刪掉條目，在 `resolution-history.md` 不用另記。
  - **看不出來** → 照實寫「待人判斷」與已知的事實，不要猜。
- 驗證就是第 2 步那次 `pnpm tc` 和重跑測試。寫下跑了什麼、結果如何、在哪個上游 sha 上跑的；沒驗證的標「未驗證」。
- 寫進 `$S/known-resolutions.md`，**一個根因一條**，格式照檔案開頭的範本：標題寫上游 commit、fork commit、canary 日期；內容列出衝突檔，以及連帶出現的 typecheck 錯誤檔和失敗測試，這樣 auto-rebase 看到同樣的症狀，就知道是同一件事。上游 commit 一定要寫完整的 sha（fork 自身問題除外）：auto-rebase 用 `git merge-base --is-ancestor <它> vNEW` 判斷條目適不適用。fork commit 寫 sha 也寫標題：develop 每次 rebase 都會改寫 sha，靠標題才找得回來。
- 已經有條目的根因：這次也驗證過的話，在條目上更新「驗證（日期，上游 sha）」那行，不要另開一條。條目的 fork sha 不在目前的 develop 上（`git merge-base --is-ancestor <sha> fork/develop` 失敗，代表 develop 已被 rebase 改寫過），就用 commit 標題在 `git log --format='%h %s' "$(git describe --tags --abbrev=0 --match 'v[0-9]*' --exclude '*fork*' fork/develop)"..fork/develop` 找標題完全相同的那一個，把新的 sha 換上；找不到或不只一個，就在條目上註明「fork sha 待人判斷」。條目留著；auto-rebase 移動 develop 後會把它搬進 `resolution-history.md`。

## 4. 通知、存摘要、收尾

- **先決定要不要推 Bark**，拿這次的結果跟 `$S/canary-last.orig.json`（上一次的摘要）比：`Result:` 行跟上次的 `result` 不同、有出現新的檔案、有項目消失、setup error、報告的「Leftover canary worktrees」或第 1 步沒刪的 run worktree 不是空的，或是沒有上一次的摘要，就推；都一樣就不推。推的方式照 `.claude/skills/orca-fork-auto-rebase/SKILL.md` 第 8 步（同一個 Bash 指令裡組內容並送出，group `orca`）。
  - title：「Orca fork canary：<N 個新問題｜setup error｜全綠>」。N 是**新的根因條數**，不是檔案數；「新」指它在 `known-resolutions.orig.md` 沒有條目、檔案也不在上一次的摘要裡。條目被 auto-rebase 清掉才重寫的根因，使用者之前已經收過通知，算在「已知」那段（註明重寫幾條）。沒有新根因但有變化（例如有項目消失），就寫「沒有新問題」。
  - body：上游 main sha 與距 develop 基底幾個 commit；然後分三段：新的根因（每項一句建議，加上驗證結果；寫明已記進筆記、下一次 auto-rebase 會照做，不需要使用者處理，筆記沒寫成的除外）、已知的根因（條目名稱）、消失的項目；殘留的 worktree；最後是報告路徑 `$R/report.md`。
- 寫回筆記（第 1 步取筆記失敗就跳過，通知裡已寫原因）：
  - green 或 not green：把這次的摘要寫進 `$S/canary-last.json`，五個清單照報告原樣列還沒歸因的檔案路徑（`lintFailures` 列報告「Lint failures」的步驟；上一次的摘要沒有這個欄位就當空清單）；`result` 記下 install 或 test listing 失敗這類清單表達不出來的狀態。下一次就拿它來比對：

    ```json
    {"upstream": "<sha>", "date": "<YYYY-MM-DD>", "report": "<$R/report.md，家目錄寫成 ~>", "result": "<Result: 行的內容>",
     "conflicts": [...], "tcErrorFiles": [...], "failingTests": [...], "droppedTests": [...], "lintFailures": [...]}
    ```

    `config/scripts/fork-notes.sh write "$tip" "canary <日期> <上游 sha>" known-resolutions.md="$S/known-resolutions.md" canary-last.json="$S/canary-last.json"`。

  - setup error：這次沒有結果可比，**不寫** `canary-last.json`（寫空清單會讓下一次把所有項目都當成新的）；`known-resolutions.md` 沒改就不寫。
  - exit 2 表示這段時間 auto-rebase 改過筆記：重新 `tip`、`git show` 出新版，把這次的改動重新套上（不要蓋掉對方刪掉或新增的條目），再寫一次。第二次還是 2，或任何其他非 0 → 不再試，在通知裡寫「筆記沒寫成」與原因。
- 清 `$OUT` 裡超過 14 天的舊報告：`find "$OUT" -mindepth 1 -maxdepth 1 -type d -mtime +14 -exec rm -rf {} +`。
- 只刪 `K`：`git worktree remove --force "$K"`。其他 `orca-fork-canary.` 開頭的不刪：可能是另一個 canary 正在跑，或使用者用 `CANARY_KEEP=1` 留著手動解衝突（腳本與 FORK.md 都規定只列不刪）。
- 最後在對話裡印出和 Bark 一樣的摘要，再加上沒推 Bark 的原因（如果沒推）。使用者事後打開這個 session，看到的應該是結果，而不是一句沒頭沒尾的話。

## 限制

- 唯一會 push 的是 `fork-canary-notes`，只經 `config/scripts/fork-notes.sh`（不 force）；不推其他分支、不開 PR。
- 不改 `MAIN` 的追蹤檔（第 1 步的 checkout 與 `pnpm install` 除外），不在 `K` commit 或跑 `git rerere`。會寫的只有筆記分支、`$OUT`、`$S`，以及 `K`（第 2 步在那裡驗證，收尾時刪掉）。
- 不開看得見的 Orca 視窗、不搶焦點（`ORCA_BACKGROUND_LAUNCH=1`）。
