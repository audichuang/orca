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

## fork 自身問題（fork 的 macOS 建置沒建上游新的 orca-process-footprint helper，發版失敗）× fork Makefile `computer-use` target — auto-rebase 2026-10-28
- 類型：fork 自身問題
- 衝突檔：無
- 連帶症狀：v1.4.243-fork.1 的 release run 40640209742 在 `make fork-dmg` 紅：`⨯ Missing orca-process-footprint helper at …/Orca.app/Contents/MacOS/orca-process-footprint`。上游 #34053（d58ab9762c）新增 `native/process-footprint-macos`，`build:native` 與 `build:mac:release` 都加了 `build:process-footprint-macos`，`config/electron-builder.config.cjs` 的 extraFiles 把它放進 `MacOS/`，afterPack 的 `signMacStandaloneHelper` 在 `isMacRelease` 時找不到就丟錯（非 release 建置只是跳過，記憶體面板退回用 `top`）。fork PR CI 的 macOS 建置是 ad-hoc、`ORCA_MAC_RELEASE` 沒設，抓不到。
- 處理：Makefile `computer-use` target 在 `pnpm run build:notification-status-macos -- --single-arch` 後加一行 `pnpm run build:process-footprint-macos -- --single-arch`。同一個 commit 加守它的 fork 測試（例如 `config/scripts/fork-mac-helper-build.test.mjs`，進 fork-check-lint 或 vitest）：讀 `config/electron-builder.config.cjs` 每個 `to: 'MacOS/orca-<name>'` 的 extraFile，斷言 Makefile 的 `computer-use` target 有對應的 `pnpm run build:<name>-macos`（`orca-keyboard-layout` → `build:keyboard-layout-macos`，依此類推）；拿掉新加那行要紅。這樣下一次上游再加 helper 也會在本機閘門紅，不會等到發版。Makefile 不是測試檔，照一般規則要 mutation 證明。
- 守它的測試：上面新加的 fork 測試；發版時 fork-release.yml 會真的簽章建置
- 驗證（2026-10-28，上游 v1.4.243）：在 ac6ddc39dc 跑 `pnpm run build:process-footprint-macos -- --single-arch` 成功，產出 `native/process-footprint-macos/.build/release/orca-process-footprint`（Mach-O 64-bit arm64）。Makefile 修改與 guard 測試未做；develop 已在 ac6ddc39dc、tag v1.4.243-fork.1 已推，修好後要發 `v1.4.243-fork.2`（或跟下一個上游 release 一起發）。

## f4d98b74e32535fb12394a085a0dd01bd9975a97、791502fae43c9886bdec4b6cf78a1bb91678c06f、2cd3e6d6a38347fd15db9f5dd3d61b1b715ba978、beb53a7f9e8816269702cf065a747bb3b08ef56e、e0f32dcac1d0669952bd5ec7c43fc94c9c0158df、1df26abf60f9da03f850d76150e251a304be6f04、8b64ec281a318d1bd1d041a4525cd5986dca2370（上游 main 的 7 個 CI commit）× fork 4e3b0c1fbd、f87f545202、5791e58c0c、d5d565db6a、e6469b6a48、8b5087529e、bca26276e6（這 7 個 commit 自己的 cherry-pick）— auto-rebase 2026-10-28
- 類型：上游修了同一件事
- 衝突檔：可能有 `.github/` 與這些 commit 碰的 config/scripts 測試檔
- 連帶症狀：無
- 處理：v1.4.243 的 eb94767705（ci: sync release workflows with main for the v1.4.243 cut）把 `.github/` 同步到上游 main 8b64ec281a，讀 workflow 的 12 個上游測試卻沒同步，乾淨的 v1.4.243 一樣紅。auto-rebase v1.4.243 用 `cherry-pick -x --no-commit` 帶進這 7 個 commit，`.github/` 一律留 v1.4.243 那側，只帶測試、腳本、`config/vitest.config.ts`、`config/tsconfig.node.json`、docs（訊息有 `(cherry picked from commit …)`）。因為少了 `.github/` 的 hunk，patch-id 跟上游不同，rebase 到含它們的 release 時**不會自動略過**。適用條件 `git merge-base --is-ancestor 8b64ec281a318d1bd1d041a4525cd5986dca2370 vNEW`：成立就照第 1 步「丟 commit」的做法，用下面的標題在 `vOLD..OLD_DEVELOP` 各找到一個丟掉（7 個都要丟；只有部分是 vNEW 祖先時，只丟是祖先的那幾個）：
  - `ci: run hourly and daily dev builds on free hosted runners (#34585)`
  - `ci: move secondary, scheduled and contract workflows to GitHub-hosted runners (#34568)`
  - `ci: narrow churny cache keys and move PR-local cache saves to main (#34600)`
  - `ci: keep hourly and daily macOS builds on Blacksmith (#34640)`
  - `ci: seed hosted Linux packaging and mobile bundle caches on main, and stop PR-local saves (#34672)`
  - `ci(adhoc): package Mac architectures on 6-vCPU runners (#34673)`
  - `ci: restore main's Vitest transform cache in PR unit shards (#34512)`
  丟完後 `config/scripts/orcad-windows-prebuild-cache.mjs` 會回到上游版（cherry-pick 版少了 v1.4.243 沒有的 `wsl-distro-allowlist.ts` 那行）。
- 守它的測試：fork CI 的整套單元測試（ci-native-cache、ci-dependency-download-cache、ci-unit-module-cache、mobile-{typecheck-cache,test-change-scope,release-check-scope}、ssh-windows-mobile-bundle、mac-notarization-builder-contract、hourly-preflight-workflow、dev-channel-orcad-template-workflow）
- 驗證（2026-10-28，上游 v1.4.243）：cherry-pick 前 CI run 40632346756 與乾淨 v1.4.243 都是 12 個紅；之後 13 檔 303 測試綠，CI run 40638472279 全綠。

## fork 自身問題（folder 分頁讀檔的 `options?.gitWorktreeId` 沒有測試守）× fork 3c377c2b27（folder workspace 多 repo）— auto-rebase 2026-10-28
- 類型：fork 自身問題
- 衝突檔：無
- 連帶症狀：無（審查者 C2 的 mutation：拿掉 `useEditorPanelFileContentLoader.ts` `readWorktreeId` 的 `options?.gitWorktreeId ??`，seam 測試與 editor、store 目錄全綠）
- 處理：在 `src/renderer/src/components/editor/folder-relative-git-consumers.test.tsx` 補一例：`loadFileContent` 帶 `{ gitWorktreeId: 'repo-a' }`、沒有對應的 open file（`restoredOpenFile` 為空）時，讀檔走 repo-a 的 runtime target，不是 folder。只改 fork 測試檔，拿掉那個 `??` 要紅。這個 hunk 在 v1.4.243 rebase 時衝突過（上游在旁邊加了 `readGrantId` 兩行），fork 行沒變，所以這次算既有缺口。
- 守它的測試：folder-relative-git-consumers.test.tsx（fork-seam-tests「Upstream component slots and folder routing」組）
- 驗證：未驗證（只有 C2 的 mutation 結果）

## fork 自身問題（recovery launch 的 `worktreeId: launchWorktreeId` 沒有測試守）× fork 3c377c2b27、b110bc0711（folder repo launch cwd）— auto-rebase 2026-10-28
- 類型：fork 自身問題
- 衝突檔：無
- 連帶症狀：無（審查者 C2 的 mutation：`recovery-launch.ts` 的 `worktreeId: launchWorktreeId` 改回 `activeWorktreeId`，1075 檔全綠：`recovery-launch.folder-cwd.test.ts` 第一例兩個值相同，第二例在啟動前就被拒）
- 處理：在 `recovery-launch.folder-cwd.test.ts` 補一例：`acquireAgentLaunchChoices` 的 mock 改成可變（`detected: ['codex']`），`editorWorktreeId: FOLDER` 時斷言 `launchAgentInNewTab` 收到 `worktreeId: FOLDER, initialCwd: '/work/repo-1'`。只改 fork 測試檔，改回 `activeWorktreeId` 要紅。
- 守它的測試：recovery-launch.folder-cwd.test.ts（fork-seam-tests「Agent launch cwd in folder repos」組）
- 驗證：未驗證（只有 C2 的 mutation 結果）

## fork 自身問題（待人判斷，auto-rebase 不要照做：folder 層級的外部變更要不要配對到 repo-scoped diff 分頁：兩條路徑不一致）× fork 3c377c2b27（folder workspace 多 repo）、ba35906362（folder diff 改用 filePath 比對）— auto-rebase 2026-10-27
- 類型：待人判斷
- 衝突檔：無
- 連帶症狀：無（審查者 C 的 mutation：拿掉 `editor-autosave.ts:177` 的 `getOpenFileGitWorktreeId(file) === target.worktreeId`，所有測試仍綠）
- 處理：`getOpenFilesForExternalFileChange` 的 fallback 路徑（沒有 `indexedOpenFiles` 時）用第 177 行排除「target 是 folder 本身、分頁是 repo-scoped diff」的情境；`editor-external-watch-path-index.ts` 的 index 路徑在同一情境以 `filePath` 配對、會包含它。第 177 行原本是為了 relativePath 撞名（ba35906362 之前用 relativePath 比對），現在 scoped 分頁已改用 filePath 比對，這個目的已由第 174 行達成。要使用者決定：刪掉第 177 行（跟 index 路徑一致），或讓 index 路徑也排除；決定後在 `editor-autosave.fork.test.ts` 補一個會咬的測試。不要在 auto-rebase 裡自己選一邊。
- 守它的測試：待補（editor-autosave.fork.test.ts）
- 驗證：未驗證（只有讀程式碼與 C 的 mutation 結果）
