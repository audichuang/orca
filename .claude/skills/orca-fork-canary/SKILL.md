---
name: orca-fork-canary
description: Daily unattended trial merge of the Orca fork's develop into upstream main (`make fork-canary`) that diagnoses new conflicts and failing fork tests, records their resolutions on the fork-canary-notes branch for the auto-rebase, and sends a Bark notice only when something changed. Use when the "Orca fork canary" Orca automation fires or the user asks to run the canary.
---

# Orca fork canary

無人值守：沒有人會回答問題，不要停下來問。repo 是 audichuang/orca（remote `fork`），上游 stablyai/orca（remote `origin`）。這個技能只產出報告與筆記，能動什麼見文末「限制」。

目的：上游幾乎每天發一版。canary 先對上游 `main` 試合，讓下一次 `orca-fork-auto-rebase` 開跑時，衝突與該丟的 fork commit 已經查清楚、寫在筆記分支 `fork-canary-notes` 的 `known-resolutions.md`（跟 develop 沒有共同歷史，不跑 CI、不會被 rebase 改寫）。

## 1. 跑 canary

先清掉之前 run 留下的 worktree：`git worktree list` 裡路徑含 `auto-orca-fork-canary-run-` 而且不是目前這個的，逐一 `orca worktree rm --worktree "id:622b02e4-f394-4c0d-a683-b027f426796b::<路徑>" --force --json`（只刪這種）。canary 從不改 run worktree，所以 `git -C <路徑> status --porcelain --untracked-files=no` 有輸出的，是有人接手在用：不刪，列進通知。

在 Orca 為這次 run 開的 worktree 裡做（不要動 `~/Project/orca` 主 checkout）：

```sh
git fetch -q fork && git fetch -q origin main --tags
git checkout -q --detach fork/develop
pnpm install --frozen-lockfile
CANARY_KEEP=1 make fork-canary
```

- 用 `make`：它會帶入 `FORK_BASE` 與 `UPSTREAM_REMOTE`。直接呼叫 `config/scripts/fork-canary.sh` 少了這兩個變數，會 setup error（exit 3）。
- `CANARY_KEEP=1`：留下合併好的 worktree，第 3 步要在裡面套用解法、驗證。不要為了驗證重跑一次 canary。
- 要跑好幾分鐘（typecheck 加一百多個 fork 測試檔），在背景跑，等完成通知。
- `make` 會把腳本的 exit code 換成自己的，所以結果看報告的 `Result:` 行（green / not green / setup error）。報告在 `out/fork-canary/$(cat out/fork-canary/latest.txt)/report.md`，輸出最後一行 `kept canary worktree <路徑>` 是留下的 worktree。setup error → 跳到第 4 步，通知寫報告裡的訊息。

## 2. 歸因：哪些是同一件事

先取筆記：`tip=$(config/scripts/fork-notes.sh tip)`，`git show "$tip":known-resolutions.md > <scratch>/known-resolutions.md`、`git show "$tip":canary-last.json > <scratch>/canary-last.json`。第 3、4 步改這兩份本機副本，最後一次寫回。

報告裡衝突的檔案會被重設成上游版本，所以很多 typecheck 錯誤和失敗測試只是**衝突的連帶症狀**，不是獨立的問題。先歸因，再診斷：

1. 對每個衝突檔，先看 `known-resolutions.md` 有沒有條目。有就照它做，沒有就照第 3 步判斷怎麼合。把解法都套進留下的 worktree。
2. 在那個 worktree 跑 `pnpm tc`，再重跑一次 canary 跑過的那批測試檔：

   ```sh
   node config/scripts/ensure-native-runtime.mjs --runtime=node
   python3 -c "import json,sys;print('\n'.join(sorted({r['name'] for r in json.load(open(sys.argv[1]))['testResults']})))" <報告目錄>/logs/vitest.json \
     | xargs env LC_ALL=C ORCA_BACKGROUND_LAUNCH=1 pnpm exec vitest run --config config/vitest.config.ts
   ```
3. 套上解法就消失的 typecheck 錯誤和失敗測試，歸到那個衝突的條目。剩下的才是獨立問題，各自是一個根因。

例：2026-10-25 那次有 7 個衝突檔、6 個 typecheck 錯誤檔、7 個失敗測試檔，歸因後是 5 個根因，只有 1 個是新的（上游 revert #32320，撞到 fork 在同一段的改動）。

**哪些要診斷**：看 `known-resolutions.md` 有沒有條目，不看上一次的摘要。原因：上游一發版，auto-rebase 處理完就會刪掉條目，但 develop 可能還沒移動，同樣的衝突隔天還在。這時只跟摘要比，會以為「不是新的」而跳過，處理方法就沒人記了。第一次跑、還沒有摘要時也一樣。

## 3. 診斷沒有條目的根因，寫進 known-resolutions.md

- 看報告列的上游 commit 與 fork commit（`git show <sha>`），判斷是哪一種：
  - **上游修了同一件事**（像 078ffe8487 被上游 #6282 取代）→ 建議丟掉那個 fork commit，列出要一起刪的 fork 測試與常數。
  - **兩邊各改各的** → 寫清楚怎麼合（採上游結構，再把 fork 的哪幾行加回），以及守它的測試（`config/fork-seam-tests.txt` 裡的哪一組）。上游 revert 一個 fork 也有改到的功能，也算這一種：fork 的行加回，被上游刪掉的東西不要加回來。
  - **上游改了 fork 依賴的 API**（改名、刪 export、改簽章）→ 寫 fork 這邊要怎麼跟上。
  - **看不出來** → 照實寫「待人判斷」與已知的事實，不要猜。
- 驗證就是第 2 步那次 `pnpm tc` 和重跑測試。寫下跑了什麼、結果如何、在哪個上游 sha 上跑的；沒驗證的標「未驗證」。
- 寫進 `known-resolutions.md` 的本機副本，格式照檔案開頭說明與現有條目：**一個根因一條**，標題寫上游 commit、fork commit、canary 日期；內容列出衝突檔，以及連帶出現的 typecheck 錯誤檔和失敗測試。這樣 auto-rebase 看到同樣的症狀，就知道是同一件事。
- 已經有條目的根因：這次也驗證過的話，在條目上更新「驗證（日期，上游 sha）」那行，不要另開一條。上游還沒發版的條目留著；auto-rebase 處理完會自己刪。

## 4. 通知、存摘要、收尾

- **先決定要不要推 Bark**，拿這次的結果跟 `<scratch>/canary-last.json`（上一次的摘要，還沒覆寫）比：有出現新的檔案、有項目消失、setup error，或是沒有上一次的摘要，就推；跟上一次一樣就不推。推的方式照 `.claude/skills/orca-fork-auto-rebase/SKILL.md` 第 8 步（同一個 Bash 指令裡組內容並送出，group `orca`）。
  - title：「Orca fork canary：<N 個新問題｜setup error｜全綠>」，N 是**新的根因條數**，不是檔案數。「新」指上一次的摘要裡沒有它的檔案，known-resolutions 也沒有它的條目。條目被 auto-rebase 清掉才重寫的根因，使用者之前已經收過通知，算在「已知」那段（註明重寫幾條）。沒有新根因但有變化（例如有項目消失），就寫「沒有新問題」。
  - body：上游 main sha 與距 develop 基底幾個 commit；然後分三段：新的根因（每項一句建議，加上驗證結果）、已知的根因（條目名稱）、消失的項目；報告「Leftover canary worktrees」與第 1 步沒刪的 run worktree；最後是報告路徑。
- 再把這次的摘要寫進 `<scratch>/canary-last.json`（五個清單照報告原樣列還沒歸因的檔案路徑，下一次就拿它來比對）：

  ```json
  {"upstream": "<sha>", "date": "<YYYY-MM-DD>", "report": "<報告路徑>",
   "conflicts": [...], "tcErrorFiles": [...], "failingTests": [...], "droppedTests": [...]}
  ```

- 兩份一起寫回：`config/scripts/fork-notes.sh write "$tip" "canary <日期> <上游 sha>" known-resolutions.md=<scratch>/known-resolutions.md canary-last.json=<scratch>/canary-last.json`。exit 2 表示這段時間 auto-rebase 改過筆記：重新 `tip`、`git show` 出新版，把這次的改動重新套上（不要蓋掉對方刪掉或新增的條目），再寫一次；第二次還是 exit 2 就停，寫進通知。
- 只刪第 1 步留下的那一個 worktree：`git worktree remove --force <kept canary worktree 那行的路徑>`。其他 `orca-fork-canary.` 開頭的不刪：可能是另一個 canary 正在跑，或使用者用 `CANARY_KEEP=1` 留著手動解衝突（腳本與 FORK.md 都規定只列不刪）。
- 最後在對話裡印出和 Bark 一樣的摘要，再加上沒推 Bark 的原因（如果沒推）。使用者事後打開這個 session，看到的應該是結果，而不是一句沒頭沒尾的話。

## 限制

- 唯一會 push 的是 `fork-canary-notes`，只經 `config/scripts/fork-notes.sh`（不 force）；不推其他分支、不開 PR。
- 不改 Orca 開的 run worktree 裡的檔案。會寫的只有筆記分支、`out/fork-canary/`，以及 canary 自己的暫時 worktree（第 3 步在那裡驗證，收尾時刪掉）。
- 不開看得見的 Orca 視窗、不搶焦點（`ORCA_BACKGROUND_LAUNCH=1`）。
