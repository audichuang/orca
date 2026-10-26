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

## fork 自身問題（seam 清單漏登錄 d809e41db0 新增的測試）— auto-rebase 2026-10-26
- 類型：fork 自身問題
- 衝突檔：無
- 連帶症狀：無（unit suite 與 CI 會跑它，只是 `make fork-check-seams` 不跑）
- 處理：`src/renderer/src/components/tab-bar/tab-bar-item-model.git-status.fork.test.ts` 已有 `buildTabStripLayoutKey` 的 folder git 狀態 key 測試（v1.4.241 auto-rebase 補的），但沒列進 `config/fork-seam-tests.txt`。把它加進「Hidden folder repos」或「gitWorktreeId on editor open actions」附近最貼切的組（看該組註解；這是 folder workspace 的分頁 git 狀態），一個 commit。
- 守它的測試：`make fork-check-seams`（新登錄的檔要跑到）、`make fork-check-lint`（fork-test-inventory 檢查重複／缺漏）
- 驗證：未驗證
