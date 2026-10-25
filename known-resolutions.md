# 已知的上游衝突與處理方式

每日 canary（`make fork-canary`）對上游 main 試合時看過的衝突，一個根因一條。auto-rebase 用 `git merge-base --is-ancestor <上游 commit> vNEW` 判斷條目適用，照它處理；develop 移動後刪掉用過的條目。只經 `config/scripts/fork-notes.sh` 寫。

範本（複製後填寫，不要留這段以外的範例）：

```
## <上游 commit 完整 sha>（#PR 號、標題）× fork <短 sha>（標題）— canary <YYYY-MM-DD>
- 類型：上游修了同一件事｜兩邊各改各的｜上游改了 fork 依賴的 API｜待人判斷
- 衝突檔：<路徑>…
- 連帶症狀：typecheck 錯誤 <檔>…；失敗測試 <檔>…
- 處理：<丟掉 fork commit X 並刪哪些測試｜採上游結構後把 fork 的哪幾行加回｜fork 這邊怎麼跟上>
- 守它的測試：<config/fork-seam-tests.txt 的組名或測試檔>
- 驗證（<YYYY-MM-DD>，上游 <sha>）：<跑了什麼、結果>｜未驗證
```

## 0b28553093b872fb0013795ad334d6001da34967（#33450、feat(ssh): show saved port forwards that couldn't start…）× fork fa84af8c04、519950c24b 等 Git Graph 系列（Commits 區分支篩選、Git Graph 全螢幕分支樹）— canary 2026-10-25
- 類型：兩邊各改各的
- 衝突檔：src/renderer/src/i18n/locales/{en,es,fr,ja,ko,pt,zh}.json（每檔一個 hunk）
- 連帶症狀：無（typecheck 與 170 個 fork 測試檔在上游側的 locale 下也全過，所以只有衝突，沒有其他症狀）
- 處理：上游在 `auto.components.right.sidebar` 尾端新增 `ssh.unrestored.port.row`（3 個 key），fork 在同一處新增 Git Graph 的字串（`GitHistoryGraph` 等）。兩邊都只新增 key，沒有重疊、也沒有刪除。照 FORK.md 兩邊都留，但**不要直接手改衝突標記**：上游那段結尾停在還沒關的 `ssh` 物件裡，兩段直接接起來會變成不合法的 JSON。改用 JSON deep merge：以上游（ours）檔為底，依序補上 fork（theirs）有、上游沒有的 key，用 `json.dumps(…, ensure_ascii=False, indent=2) + "\n"` 輸出（上游檔用這個格式重新輸出，與原檔逐位元組相同）。key 有重疊時值必須相同，不同就停下來。
- 守它的測試：`pnpm run verify:localization-catalogs`、`node config/scripts/fork-locale-parity.mjs <基底>`（`make fork-check-lint`）。注意：canary 對上游 main 試合時，FORK_BASE 還是舊 tag，上游 main 新加、只放進 en.json 的 key（像 #33260 的 `auto.store.slices.worktrees.localBaseRef*`，14 個）會被誤算成 fork key，報 6 個 locale 各缺 14 個；改用上游 main 當基底就通過。auto-rebase 時基底是 vNEW，不會有這個誤報。
- 驗證（2026-10-25，上游 aa08c84f3b8cb6bbdd62db1d803ba8b3e7973fda）：在 canary worktree 依上述 deep merge 合好 7 檔 → `verify:localization-catalogs` 通過（17550 個 key 參照）；`fork-locale-parity.mjs HEAD`（上游 main 當基底）通過，fork 的 174 個 key 7 個 locale 都有；`pnpm tc` 通過；canary 那 170 個測試檔 963 個測試全過。
