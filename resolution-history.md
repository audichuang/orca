# 處理紀錄

之前的 auto-rebase、canary 與人工處理各做了什麼，新的在最上面，只增不刪。遇到 `known-resolutions.md` 沒寫到的衝突或問題，先在這裡找同一個檔或同一個 fork commit 的前例照做。auto-rebase 每次 run 都會加一條；用掉的 `known-resolutions.md` 條目整段搬到這裡。只經 `config/scripts/fork-notes.sh` 寫。

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
