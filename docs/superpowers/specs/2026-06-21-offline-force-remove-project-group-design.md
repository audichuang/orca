# 設計 v2：斷線時本地強制移除 project group（墓碑 + 重連補刪）

- 狀態：v2（已納入 codex 規劃審查；待 codex 複審 → subagent 開發 → codex 審程式）
- 日期：2026-06-21
- 分支：`feat/offline-force-remove-project-group`（從 `develop`）
- Worktree：`/home/audichuang/research/orca-offline-force-remove`
- v2.1 變更：依 codex 複審補 3 小修（fetch 順序/snapshot、local-only purge、`repo_not_found` idempotency），見 §0.1。

## 0. v2 對 codex 審查的回應（變更摘要）

1. **【簡化｜原 blocker 2】功能只 scope 到 runtime-environment 擁有的 group。** `deleteProjectGroup` 只看 `activeRuntimeEnvironmentId` 路由（`repos.ts:1151-1165`），與 group 的 `connectionId` 無關；本地 store 的 SSH-folder group 走 `window.api.projectGroups.delete`（純本地 state，`persistence.ts:3415`），**離線照樣刪得掉**。真正會卡住的只有 active target = 某個離線 runtime environment 時、刪它的 group。→ 墓碑 key = `environmentId`，不需要 SSH partition、不需要混合 host 過濾。
2. **【原 blocker 1 + finding 3】墓碑改存 `pendingProjectIds`。** 勾選刪 repo 時，在強制移除當下就把 subtree 內 repo id 快照進墓碑。replay 直接用這份 id 清單打 `repo.rm`，**不需要重連時 raw fetch 重算 subtree**（一併解掉「raw fetch 會不會與既有 refresh 打架」的疑慮）。
3. **【原 major 3】replay 用 host-targeted adapter，不沿用 active-target action。** 直接 `callRuntimeRpc({ kind:'environment', environmentId }, 'repo.rm' | 'projectGroup.delete')`，不經會吞錯回 `void` 的 `removeProject`、也不經只看 active target 的 `deleteProjectGroup`。
4. **【原 major 4】hydration 排在所有 fetch 之前**，並在 reconnect 時先 replay 再讓 group/folderWorkspace 重新 fetch（`refreshRuntimeEnvironmentProjects` 不 fetch group/workspace，需另接）。
5. **【原 major 5】本地 cleanup 改為重用 `removeProject` 的本地清理。** 抽出 `purgeProjectLocalState`（`removeProject` 的 post-RPC body），強制移除勾選 repo 時呼叫；folder workspace 也走既有 renderer 移除清理（session/lineage/active 狀態）。
6. **【原 major 6】拿掉 typed `not-found`。** replay 把「delete RPC 有回應」（不論 `deleted` true/false）一律視為成功→清墓碑；只有 transport 拋錯/timeout 才保留墓碑。互動觸發的 `deleteProjectGroup` 只分 `unreachable`（RPC 拋錯/timeout）與 `rejected`（RPC 回 `{deleted:false}`）。

## 0.1 v2.1 對 codex 複審的回應

7. **【複審 major｜fetch 順序 + subtree snapshot】** 墓碑加存 `subtreeGroupIds`（移除當下的 subtree group id 快照）。repo / folder workspace 過濾以「`subtreeGroupIds` 快照 ∪ 從當下 fetch 的 groups 即時重算」為準，**不依賴 repos 與 groups 的 fetch 先後**。另明確規定 active environment 首次/重連的 fetch 順序：`hydrate tombstones → fetchProjectGroups → fetchRuntimeEnvironmentRepos`。
8. **【複審 major｜local-only purge】** `purgeProjectLocalState(get,set,projectId,{ stopRemoteTerminals:false })`：強制移除離線路徑**不送** `removeProject` body 內的 remote `terminal.stop` RPC（`repos.ts:1667`），避免又卡 timeout；只做本地 state 清理（remote PTY 的 `remote:` ptyId 本就被 local `pty.kill` 跳過）。
9. **【複審 major-ish｜repo_not_found idempotency】** replay 對 `repo.rm` 需 catch `RuntimeRpcCallError.code === 'repo_not_found'` 視為成功（repo 早已不存在）；只有 transport 失敗（拋錯/timeout）才算未完成、保留墓碑重試。其他 app error 記錄但不無限重試誤判為 transport。

## 1. 問題與動機

當 active runtime environment 離線（例如使用者關掉承載它的 SSH 連線）時，刪除它擁有的 project group 會經 `callRuntimeRpc('projectGroup.delete')` 送往遠端 daemon，RPC 拋錯或 15 秒 timeout → 被 catch 回 `false` → 只跳籠統 toast「Something went wrong while deleting the group. No projects were removed.」。

結果：**離線的 runtime environment 擁有的 group 卡住刪不掉，擋住使用者切換到 server 模式**，沒有本地逃生口。

### 1.1 關鍵事實（決定設計）

1. **路由只看 `activeRuntimeEnvironmentId`**（`runtime-rpc-client.ts:25` `getActiveRuntimeTarget`）。active 是 local → 一切本地、不碰網路；active 是 environment → 全部走 RPC。
2. **遠端 environment 的 group 在本地不持久化**：`fetchProjectGroups`（`repos.ts:812`）對 environment 走 `projectGroup.list` RPC，整包取代 renderer `projectGroups`。source of truth = 遠端 daemon store。重連 refresh 會把它抓回來 → 純本地刪除若不處理重連會「刪了又回來」。
3. **group 帶 `executionHostId`**（`types.ts:289`）：runtime-fetched group 一律蓋成 `runtime:<environmentId>`（`repos.ts:288` `projectGroupWithFetchedOwner` → `getRuntimeTargetHostId`）。這是墓碑比對 key。
4. **刪 group 的 cascade**（`persistence.ts:3415`，本地與遠端 daemon 共用）：刪整個 subtree group；底下 repo 只 detach、不刪；底下 folder workspace 連 session/lineage 一起刪。「一併移除底下專案」勾選是**額外**對每個 repo 呼叫 `repo.rm`（renderer `removeProject` → `repos.ts:1650`，做深層本地清理且會吞錯回 `void`）。

## 2. 核心原則

強制移除 = **本地立即生效 + 持久化墓碑 + 重連時 host-targeted 補送 RPC**，最終一致。墓碑未清除前所有 fetch 都過濾掉對應 subtree，避免「刪了又回來」；environment 永不重連時墓碑永久過濾、無害，且 environment 被移除時 GC。

決策（已拍板，v2 在 runtime-env scope 下落實）：
- **D1**：墓碑 + 重連補刪（最終一致）。
- **D2**：沿用 `removeContainedProjects` 勾選 —— group 一定墓碑；勾選時 subtree repo id 快照進 `pendingProjectIds`、重連逐一 `repo.rm`。
- **D3**：雙軌觸發 —— 事前偵測（active environment 已知離線 → 直接走本地路徑、不空等）+ 失敗 fallback（RPC `unreachable` → 跳「改為本地強制移除？」）。

## 3. 資料模型

`src/shared/types.ts`：
```ts
export type PendingProjectGroupDeletion = {
  /** 擁有此 group 的 runtime environment（強制移除當下的 active environment） */
  environmentId: string
  /** 被移除的 group（subtree root） */
  groupId: string
  /** true 時 replay 另對 pendingProjectIds 逐一 repo.rm */
  removeContainedProjects: boolean
  /** removeContainedProjects 為真時，移除當下 subtree 內的 repo id 快照；否則 [] */
  pendingProjectIds: string[]
  /** 移除當下的 subtree group id 快照；供 repo/folder-workspace 過濾在 groups 尚未 fetch 時兜底 */
  subtreeGroupIds: string[]
  createdAt: number
}
```
`PersistentState`（`persistence.ts`）新增 `pendingProjectGroupDeletions?: PendingProjectGroupDeletion[]`，預設 `[]`，load 容缺。

> 分工（v2/v2.1 關鍵）：group 隱藏 = 「`subtreeGroupIds` 快照 ∪ 從當下 groups 即時重算」；repo detach/隱藏 = repo.projectGroupId ∈ 同上聯集（或 repo.id ∈ `pendingProjectIds`）；repo 補刪用 `pendingProjectIds`。快照讓過濾**不依賴 fetch 先後**，即時重算則涵蓋重連後遠端新增的子 group。

## 4. 模組切分

### 4.1 純函式過濾層 — `src/shared/pending-project-group-deletions.ts`（新）
無副作用，main/renderer 共用：
- `selectPendingDeletionsForEnvironment(tombstones, environmentId)`
- `collectTombstonedGroupIds(groups, tombstones, environmentId): Set<string>` — 對每筆墓碑取「`subtreeGroupIds` 快照 ∪ `getProjectGroupSubtreeIds(groups, groupId)`」再聯集。`groups` 可為空（repos 先於 groups fetch 時）→ 退回只用快照。
- `filterGroupsByPendingDeletions(groups, tombstones, environmentId): ProjectGroup[]`
- `applyPendingDeletionsToRepos(repos, groups, tombstones, environmentId): Repo[]` — repo.projectGroupId ∈ tombstoned 集合（或 repo.id ∈ `pendingProjectIds`）：對應墓碑 `removeContainedProjects` 為真 → 隱藏；否則 → detach。`groups` 缺時以快照集合判斷（解 codex 複審 major 4）。
- `filterFolderWorkspacesByPendingDeletions(workspaces, groups, tombstones, environmentId): FolderWorkspace[]`

> 安全網：重連 refetch 把遠端資料抓回來後，套這層仍維持「已移除」直到 replay 清墓碑。

### 4.2 主程序持久化 — `src/main/persistence.ts`
與既有 `deleteProjectGroup` 同 `Store` class：
- `getPendingProjectGroupDeletions()`
- `addPendingProjectGroupDeletion(entry)` — 同 `(environmentId, groupId)` 去重覆蓋。
- `removePendingProjectGroupDeletion(environmentId, groupId)`
- `clearPendingProjectGroupDeletionsForEnvironment(environmentId): number`（GC）
每次寫入 `scheduleSave()`。

### 4.3 IPC + preload
`src/main/ipc/repos.ts` 新增（與 `projectGroups:*` 並列）：
- `pendingProjectGroupDeletions:list`
- `pendingProjectGroupDeletions:add`（`{ environmentId, groupId, removeContainedProjects, pendingProjectIds, subtreeGroupIds }`）
- `pendingProjectGroupDeletions:remove`（`{ environmentId, groupId }`）

preload 暴露 `window.api.pendingProjectGroupDeletions.{list,add,remove}`。GC 的 `clearForEnvironment` 在 environment 移除流程由主程序內部直接呼叫 store 方法（不需 IPC）。

### 4.4 Renderer state + 過濾掛載 — `src/renderer/src/store/slices/repos.ts`
- 新 state `pendingProjectGroupDeletions: PendingProjectGroupDeletion[]`。
- 新 action `hydratePendingProjectGroupDeletions()`：呼叫 `pendingProjectGroupDeletions:list` 填入 state。**必須在 App 啟動的第一輪 fetch（`App.tsx` 啟動序列）之前完成。**
- 在三個 fetch 回傳處套 4.1，`environmentId = target.kind==='environment' ? target.environmentId : null`（local target 不過濾）：
  - `fetchProjectGroups`（`repos.ts:812`）
  - `fetchRuntimeEnvironmentRepos`（`repos.ts:~780`）
  - `fetchFolderWorkspaces`（`repos.ts:837`）
- **fetch 順序（active environment 首次/重連）**：`hydratePendingProjectGroupDeletions → fetchProjectGroups → fetchRuntimeEnvironmentRepos → fetchFolderWorkspaces`，使 repo/workspace 過濾拿得到剛 fetch 的 groups。即使順序被打散（背景刷新單獨 fetch repos），4.1 的 `subtreeGroupIds` 快照兜底仍正確（解 codex 複審 major 4）。

### 4.5 強制移除動作 — `src/renderer/src/store/slices/repos.ts`
`forceRemoveProjectGroupLocally(groupId, { removeContainedProjects }): Promise<void>`：
1. 僅當 group owner 是 active runtime environment（`executionHostId === runtime:<activeEnvironmentId>`）；否則不該被呼叫（UI 不顯示此路徑）。
2. 從當下 renderer state 算 subtree：`subtreeGroupIds`、folder workspaces、repos。`removeContainedProjects` 為真 → `pendingProjectIds = subtree 內 repo ids`（否則 `[]`）。`subtreeGroupIds` 一律記錄。
3. `pendingProjectGroupDeletions:add(...)` 並更新 renderer state。
4. 本地 state 清理（抽共用 helper `applyLocalProjectGroupRemoval`）：
   - 移除 subtree group。
   - 移除 subtree folder workspace（走既有 renderer folder-workspace 移除清理：session/lineage/active workspace 狀態）。
   - subtree repo：`removeContainedProjects` 為真 → 對每個呼叫 `purgeProjectLocalState(get,set,projectId,{ stopRemoteTerminals:false })`；否則 → detach（`projectGroupId=null`）。
5. 跳 toast，附「復原」action（`pendingProjectGroupDeletions:remove` + 重新 fetch 該 environment）。

> 重構（解 major 5）：把 `removeProject`（`repos.ts:1650`）的 post-RPC 本地清理抽成 `purgeProjectLocalState(get,set,projectId,opts)`，含 `purgeWorktreeTerminalState`、editor、tab 等本地 state。`opts.stopRemoteTerminals` 預設 true（`removeProject` 用）；**強制移除離線路徑傳 `false`，跳過 `repos.ts:1667` 的 remote `terminal.stop` RPC**，否則離線又卡 timeout。`removeProject` 重構為「RPC + purgeProjectLocalState({stopRemoteTerminals:true})」。

### 4.6 重連補刪（replay） — `src/renderer/src/store/slices/repos.ts`
`replayPendingDeletionsForEnvironment(environmentId): Promise<void>`：
- 以 `environmentId` 對應的 target 直接呼叫（host-targeted，不走 active-target action）。
- 每個 environment 序列化（`Map<environmentId, Promise>` lock），避免重連抖動並發。
- 逐筆墓碑：
  1. `removeContainedProjects` 為真：對 `pendingProjectIds` 逐一 `callRuntimeRpc(target,'repo.rm',{repo:id})`。**catch `RuntimeRpcCallError.code === 'repo_not_found'` 視為成功**（repo 早已不存在）；transport 失敗（拋錯/timeout）記為未完成。
  2. 若 repo 全部成功 / 視為成功（或非勾選）→ `callRuntimeRpc(target,'projectGroup.delete',{groupId})`。
  3. delete RPC **有回應**（`deleted` true/false 皆可）→ `pendingProjectGroupDeletions:remove` 清墓碑。
  4. 有 repo.rm transport 失敗 → **不刪 group、保留墓碑**（subtree 仍可由快照/遠端算），下次重連重試。
  5. delete RPC transport 拋錯/timeout → 保留墓碑。

掛載點：
- **Runtime environment 重連 / refresh**：在 `reposChanged` 對應 environment 的處理、及 `refreshRuntimeEnvironmentProjects`（`runtime-environment-project-refresh.ts`）之前呼叫 replay；replay 清墓碑後，確保 group/folderWorkspace 也重新 fetch（該 primitive 原本只 fetch repos/worktrees/lineage，需補 group/workspace fetch 或於 reposChanged handler 內接）。
- environment 連線狀態轉 connected 時觸發（`runtime-status` slice）。

GC：
- runtime environment 被移除（`runtimeEnvironments:remove` 流程）→ `clearPendingProjectGroupDeletionsForEnvironment` + 清 renderer state。
- replay idempotent 清除（group 在遠端早被刪 → delete 有回應 → 清墓碑）。
- 假設：environmentId 為穩定 UUID、不重用（移除再新增得到新 id）。**Need to verify**：runtime environment store 的 id 生成規則（實作時確認 `src/main/ipc/runtime-environments.ts`）。

### 4.7 觸發點 — `src/renderer/src/components/sidebar/WorktreeList.tsx`
改 `handleConfirmDeleteProjectGroup`（`WorktreeList.tsx:5565`）：
- `deleteProjectGroup` 改回傳 typed：`{ ok: true } | { ok: false; reason: 'unreachable' | 'rejected' }`。`unreachable` = RPC 拋錯/timeout 或 `ensureRuntimeEnvironmentCompatible` 失敗；`rejected` = RPC 回 `{deleted:false}`。`deleteProjectGroupWithContainedProjects` 透傳（其 `'group-delete-failed'` 帶 `reason`）。
- **事前偵測** `isActiveEnvironmentOffline(state)`：active target 是 environment 且其連線狀態非 connected（`runtime-status` slice）。group owner 是該 environment 且離線 → 對話框直接走本地強制移除文案 → `forceRemoveProjectGroupLocally`，不空等 RPC。
- **失敗 fallback**：線上回 `reason==='unreachable'` → 跳「改為本地強制移除？（重連後自動同步）」→ `forceRemoveProjectGroupLocally`。`reason==='rejected'` → 維持現有錯誤 toast。

> caller 衝擊（finding 4）：renderer 直接 caller 主要是 WorktreeList + store 內部 + 測試；`deleteProjectGroupWithContainedProjects` 的 result union 加 `reason`。既有測試 `repos-project-groups-delete.test.ts` 對 `deleteProjectGroup` 的 `.resolves.toBe(true/false)` 斷言一併改成 typed 結果。

## 5. 範圍邊界（YAGNI）
- v1 **只**做 runtime-environment 擁有的 project group 強制移除（+ 勾選連帶 repo）。
- 本地 group / 本地 store 的 SSH-folder group：一律走既有同步刪除（離線本就可刪），不顯示、不進此路徑。
- 單獨 repo / folder workspace 的離線刪除：不做（基建可延伸，介面預留）。

## 6. 邊界情境
- **冪等**：replay 對「delete 有回應」「repo 已不存在」皆視為成功。
- **遠端結構變動**：group filtering fetch 時即時重算 subtree；repo 補刪用快照 id（使用者意圖以移除當下為準）。group delete 會 detach 遠端殘留 repo。
- **切換 active environment**：墓碑以 environmentId 過濾，切走切回仍正確。
- **並發**：per-environment replay lock。
- **接受的極端情況**：勾選 repo 後、group 於遠端被第三方先刪、但部分 repo 還在 → 那些 repo 由使用者重連後自行清；pendingProjectIds 仍會嘗試 `repo.rm`（idempotent）。

## 7. 測試計畫（vitest 4，`config/vitest.config.ts`，`*.test.ts` 共置；執行 `pnpm test`）

### 7.1 Shared 純函式 — `src/shared/pending-project-group-deletions.test.ts`（新；仿 `folder-workspace-path-status.test.ts`）
- subtree 聯集（含巢狀）；filter 濾整個 subtree、保留無關 sibling。
- `applyPendingDeletionsToRepos`：非勾選 → detach；勾選或 id ∈ pendingProjectIds → 隱藏；不同 environmentId 互不影響。
- folder workspace 過濾。

### 7.2 主程序持久化 — 併入 `src/main/persistence.test.ts`（仿 line 2594 `await createStore()`）
- add→list；同 `(environmentId, groupId)` 去重覆蓋；remove 命中/未命中；`clearForEnvironment` 只清該 env；`writeDataFile` 載入無此欄位舊資料→預設 `[]`。

### 7.3 Renderer store — `src/renderer/src/store/slices/repos-force-remove-project-group.test.ts`（新；仿 `repos-project-groups-delete.test.ts` 的 `createTestStore`/`vi.stubGlobal`/`runtimeEnvironmentTransportCall`/`createCompatibleRuntimeStatusResponseIfNeeded`/`clearRuntimeCompatibilityCacheForTests`）
- `forceRemoveProjectGroupLocally`：寫墓碑、立即更新 state（group 移除、folder workspace 移除、repo detach；勾選 → repo 隱藏且本地清理執行、pendingProjectIds 記錄）。
- 過濾安全網：設墓碑後 `fetchProjectGroups`（mock RPC 回含該 group）→ state 不含該 group；repos detach/隱藏；folder workspaces 過濾。
- replay：mock `repo.rm` + `projectGroup.delete` 成功 → 墓碑清；勾選 → `repo.rm` 對每個 pendingProjectId 呼叫、再 delete。
- replay 冪等：`projectGroup.delete` 回 `{deleted:false}` → 仍清墓碑；RPC reject（unreachable）→ 留墓碑且不送 delete（repo.rm 先失敗時）。
- typed result：local 成功 `{ok:true}`；remote `{deleted:false}` → `{ok:false, reason:'rejected'}`；RPC reject → `{ok:false, reason:'unreachable'}`。

### 7.4 觸發 UX — `src/renderer/src/components/sidebar/...`（仿既有 worktree-list 測試）
- `isActiveEnvironmentOffline`：env 離線判斷。
- 離線偵測 → 走 `forceRemoveProjectGroupLocally`、不呼叫遠端 delete。
- 線上 `unreachable` → fallback；`rejected` → 維持錯誤 toast。

### 7.5 回歸
- 既有 `repos-project-groups-delete.test.ts`、`repos-project-groups.test.ts` 全綠（typed 結果調整斷言）。
- `pnpm test` 全綠；`max-lines` 不可 disable（必要時拆檔，例如過濾純函式已獨立成檔）。

## 8. 驗收標準
1. active runtime environment 離線時，刪除其 group 不再只跳籠統錯誤，而可「本地強制移除」並立即從側邊欄消失。
2. environment 重連後，遠端 store 對應 group（與勾選時的 repo）被 host-targeted 自動清除，墓碑消失，不再出現；過程不誤刪/誤藏無關 group/repo。
3. environment 永不重連時 group 永久不顯示；移除 environment 後墓碑被 GC。
4. 本地 group 與本地 SSH-folder group 行為完全不變。
5. 完整測試（7.1–7.5）全綠，無 lint 違規。
