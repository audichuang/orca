# 實作計畫：斷線時本地強制移除 project group

對應設計：`docs/superpowers/specs/2026-06-21-offline-force-remove-project-group-design.md`（v2.1，已過 codex 三輪審查放行）。實作子代理應同時讀本計畫的 task brief 與該 spec 對應章節取得完整契約。

Worktree（所有讀寫都在此）：`/home/audichuang/research/orca-offline-force-remove`
分支：`feat/offline-force-remove-project-group`

## Global Constraints（綁定需求，reviewer 注意鏡）

- **範圍**：本功能只處理 **runtime-environment 擁有的 project group**（`executionHostId === 'runtime:<environmentId>'`，由 `getRuntimeTargetHostId` 推導）。本地 group 與本地 store 的 SSH-folder group（active target = local）的刪除行為**必須完全不變**，照走既有同步刪除。
- **墓碑型別**（`src/shared/types.ts`）：
  ```ts
  export type PendingProjectGroupDeletion = {
    environmentId: string
    groupId: string
    removeContainedProjects: boolean
    pendingProjectIds: string[]   // 勾選時 = 移除當下 subtree repo ids；否則 []
    subtreeGroupIds: string[]     // 移除當下 subtree group id 快照
    createdAt: number
  }
  ```
- **最終一致**：強制移除 = 立即本地生效 + 持久化墓碑；重連時 host-targeted 補送 RPC；fetch 過濾是安全網。
- **RPC 契約**：`repo.rm` params `{ repo: id }`；`projectGroup.delete` params `{ groupId }`。replay 對 `repo.rm` 之 `RuntimeRpcCallError.code === 'repo_not_found'` 視為成功；只有 transport 拋錯/timeout 才保留墓碑。
- **離線 purge**：`purgeProjectLocalState` 在離線路徑傳 `{ stopRemoteTerminals: false }`，不得送 remote `terminal.stop` RPC（`repos.ts:1667` 段）。
- **過濾**：以「`subtreeGroupIds` 快照 ∪ 從當下 fetch 的 groups 即時重算」為準，不依賴 repos/groups fetch 先後。
- **lint**：**禁止** `eslint-disable`/`oxlint-disable max-lines`；超行就拆檔。
- **註解**：英文、只寫非顯而易見的「why」、一兩行。
- **測試慣例**：vitest 4，`*.test.ts` 與原始碼共置；main 用 `await createStore()`；renderer 用 `createTestStore()` + `vi.stubGlobal('window',{api})` + `runtimeEnvironmentTransportCall`/`createCompatibleRuntimeStatusResponseIfNeeded`/`clearRuntimeCompatibilityCacheForTests`（見 `repos-project-groups-delete.test.ts`）。每個 task 須 TDD 並附 RED/GREEN 證據。
- **驗證指令**：針對檔案 `npx vitest run --config config/vitest.config.ts <path>`；提交前跑相關測試全綠。

---

## Task 1: Shared 墓碑型別 + 純函式過濾模組

**目標**：建立資料型別與無副作用的過濾層（main/renderer 共用），完全 TDD。

**檔案**：
- 改 `src/shared/types.ts`：新增 `PendingProjectGroupDeletion`（型別見 Global Constraints）。
- 新 `src/shared/pending-project-group-deletions.ts`：
  - `selectPendingDeletionsForEnvironment(tombstones, environmentId): PendingProjectGroupDeletion[]`
  - `collectTombstonedGroupIds(groups, tombstones, environmentId): Set<string>` — 對每筆墓碑取「`subtreeGroupIds` ∪ `getProjectGroupSubtreeIds(groups, groupId)`」聯集；`groups` 為空時退回只用 `subtreeGroupIds`。重用 `getProjectGroupSubtreeIds`（`src/shared/project-groups.ts`）。
  - `filterGroupsByPendingDeletions(groups, tombstones, environmentId): ProjectGroup[]` — 濾掉集合內 group。
  - `applyPendingDeletionsToRepos(repos, groups, tombstones, environmentId): Repo[]` — `repo.projectGroupId ∈ 集合` 或 `repo.id ∈ pendingProjectIds`：對應墓碑 `removeContainedProjects` 為真 → 濾掉；否則 → `{...repo, projectGroupId: null}`。
  - `filterFolderWorkspacesByPendingDeletions(workspaces, groups, tombstones, environmentId): FolderWorkspace[]` — 濾掉 `projectGroupId ∈ 集合`。
- 新 `src/shared/pending-project-group-deletions.test.ts`（仿 `src/main/project-groups/folder-workspace-path-status.test.ts` 純函式風格）。

**測試需涵蓋**：subtree 聯集（含巢狀 child group、快照與即時重算各自生效、groups 為空時用快照）；group 過濾濾整 subtree 留無關 sibling；repo 非勾選 detach / 勾選或 id∈pendingProjectIds 隱藏；不同 `environmentId` 互不影響；folder workspace 過濾。

**驗收**：純函式無副作用、型別正確、測試 RED→GREEN 全綠。

---

## Task 2: 主程序持久化 + IPC + preload

**目標**：墓碑的持久化與跨程序存取。依賴 Task 1 型別。

**檔案**：
- `src/main/persistence.ts`：`PersistentState` 加 `pendingProjectGroupDeletions?: PendingProjectGroupDeletion[]`（load 容缺、預設 `[]`）；`Store` class 新增：
  - `getPendingProjectGroupDeletions(): PendingProjectGroupDeletion[]`
  - `addPendingProjectGroupDeletion(entry: Omit<PendingProjectGroupDeletion,'createdAt'>): PendingProjectGroupDeletion`（同 `(environmentId, groupId)` 去重覆蓋；`createdAt` 由 store 蓋）
  - `removePendingProjectGroupDeletion(environmentId, groupId): boolean`
  - `clearPendingProjectGroupDeletionsForEnvironment(environmentId): number`
  每個寫入呼叫 `scheduleSave()`。
- `src/main/ipc/repos.ts`：新增 handlers（與 `projectGroups:*` 並列，含對應的 `removeHandler` 清理區塊）：
  - `pendingProjectGroupDeletions:list`
  - `pendingProjectGroupDeletions:add`（args 含 `environmentId, groupId, removeContainedProjects, pendingProjectIds, subtreeGroupIds`，用既有 zod/parse 慣例驗參）
  - `pendingProjectGroupDeletions:remove`（args `environmentId, groupId`）
- `src/preload/index.ts`（約 548 行 `projectGroups` 旁）+ `src/preload/api-types.ts`：暴露 `window.api.pendingProjectGroupDeletions.{list,add,remove}` 並補型別。

**測試**：併入 `src/main/persistence.test.ts`（仿 line 2594 `await createStore()`）：add→list；同 key 去重覆蓋；remove 命中/未命中；`clearForEnvironment` 只清該 env；`writeDataFile` 載入無此欄位舊資料 → `[]` 不炸。

**驗收**：persistence 測試全綠；IPC/preload 型別一致。

---

## Task 3: Renderer 重構 — typed `deleteProjectGroup` + 抽 `purgeProjectLocalState`

**目標**：為強制移除鋪路的兩個重構，不改變現有對外行為（除回傳型別）。依賴無（可與 Task 1/2 並行概念，但排此序）。

**檔案 `src/renderer/src/store/slices/repos.ts`**：
1. 從 `removeProject`（約 1650）抽出 post-RPC 本地清理為 `purgeProjectLocalState(get, set, projectId, opts: { stopRemoteTerminals: boolean })`：搬入 kill PTY、`purgeWorktreeTerminalState`、editor/tab/active 等本地清理；`opts.stopRemoteTerminals` 為真才執行 `repos.ts:1667` 的 remote `terminal.stop` RPC 段。`removeProject` 改為「RPC + `purgeProjectLocalState({stopRemoteTerminals:true})`」，行為不變。
2. `deleteProjectGroup` 回傳改為 `{ ok: true } | { ok: false; reason: 'unreachable' | 'rejected' }`：RPC 拋錯/timeout（或 `ensureRuntimeEnvironmentCompatible` 失敗）→ `unreachable`；RPC/local 回 `{deleted:false}` → `rejected`；成功 → `{ ok:true }`。
3. `deleteProjectGroupWithContainedProjects` 透傳：`'group-delete-failed'` 結果帶 `reason`。其餘 status 不變。

**測試**：更新 `src/renderer/src/store/slices/repos-project-groups-delete.test.ts` 既有斷言到 typed 結果（`deleteProjectGroup` 的 `.resolves.toBe(true/false)` → `{ok:...}`）；新增 `purgeProjectLocalState` 的 local-only（`stopRemoteTerminals:false` 不發 `terminal.stop`）測試。

**驗收**：`removeProject` 行為回歸不變；typed 結果測試全綠；既有 group delete 測試調整後全綠。

---

## Task 4: Renderer 墓碑 state + hydrate + fetch 過濾 + 強制移除 + replay

**目標**：核心功能。依賴 Task 1/2/3。

**檔案 `src/renderer/src/store/slices/repos.ts`**（過大時把純粹的 helper 拆到鄰近新檔，勿 disable max-lines）：
- state `pendingProjectGroupDeletions: PendingProjectGroupDeletion[]`。
- `hydratePendingProjectGroupDeletions()`：`window.api.pendingProjectGroupDeletions.list()` → set state。
- 在 `fetchProjectGroups`（812）、`fetchRuntimeEnvironmentRepos`（~780）、`fetchFolderWorkspaces`（837）回傳處套 Task 1 過濾函式，`environmentId = target.kind==='environment' ? target.environmentId : null`（local 不過濾）。
- `applyLocalProjectGroupRemoval(state, groupId, { removeContainedProjects })`：算 subtree → 移除 subtree group、移除 subtree folder workspace（走既有 renderer folder-workspace 移除清理，如 `purgeWorktreeTerminalState([folderWorkspaceKey(id)])`）、subtree repo：勾選 → `purgeProjectLocalState(...,{stopRemoteTerminals:false})`；否則 detach。
- `forceRemoveProjectGroupLocally(groupId, { removeContainedProjects })`：算 `subtreeGroupIds`/`pendingProjectIds`（勾選時）→ `pendingProjectGroupDeletions:add` + 更新 state → `applyLocalProjectGroupRemoval` → 回傳供 UI 顯示 undo 所需資訊。
- `replayPendingDeletionsForEnvironment(environmentId)`：per-environment 序列化 lock；對每筆墓碑：勾選時逐一 `callRuntimeRpc({kind:'environment',environmentId},'repo.rm',{repo:id})`（catch `repo_not_found` 視為成功）；全成功→ `callRuntimeRpc(...,'projectGroup.delete',{groupId})`；delete 有回應 → `pendingProjectGroupDeletions:remove` 清墓碑；transport 失敗 → 保留。

**測試**：新 `src/renderer/src/store/slices/repos-force-remove-project-group.test.ts`（仿 `repos-project-groups-delete.test.ts` 設置）。涵蓋 spec §7.3 全部：強制移除立即更新 state、過濾安全網（設墓碑後 fetch 含該 group→仍不顯示/detach/隱藏）、replay 成功清墓碑與勾選逐一 repo.rm、replay 冪等（`{deleted:false}` 清墓碑；`repo_not_found` 視成功；transport reject 保留且不送 delete）。

**驗收**：spec §7.3 測試全綠；不破壞既有 repos 測試。

---

## Task 5: 重連/刷新接線 + GC + 啟動 hydrate 順序

**目標**：把 replay 與過濾接到真實的生命週期事件。依賴 Task 4。

**檔案**：
- `src/renderer/src/App.tsx`（啟動序列 ~839）：在第一輪 `fetchProjectGroups`/`fetchRepos`/`fetchFolderWorkspaces` 之前呼叫 `hydratePendingProjectGroupDeletions()`；active environment 的初次抓取順序為 `hydrate → fetchProjectGroups → fetchRuntimeEnvironmentRepos → fetchFolderWorkspaces`。
- Runtime environment 重連/refresh：在 `reposChanged` client-event 對應 environment 的處理、及/或 `runtime-status` slice 連線轉 `connected` 時呼叫 `replayPendingDeletionsForEnvironment(environmentId)`，replay 後確保 group/folderWorkspace 也 refetch（`refreshRuntimeEnvironmentProjects` 原本只 fetch repos/worktrees/lineage）。掛載點以實際既有事件流為準（讀 `src/renderer/src/hooks/useIpcEvents.ts` 與 `runtime-environment-project-refresh.ts` 決定最小侵入點）。
- GC：runtime environment 被移除流程（`src/main/ipc/runtime-environments.ts` 的 remove，或 renderer 對應 action）→ `clearPendingProjectGroupDeletionsForEnvironment` + 清 renderer state。

**測試**：針對接線寫聚焦測試（例如 environment connected → replay 被呼叫、environment removed → 墓碑被清）；以既有 `useIpcEvents.test.ts` / runtime-status 測試慣例為準。若某接線難以單元測試，於 report 說明並改以 store 層測試覆蓋邏輯。

**驗收**：hydrate 早於 fetch；重連觸發 replay；GC 生效；測試全綠。

---

## Task 6: 觸發 UX — WorktreeList 偵測 + fallback + undo

**目標**：使用者入口。依賴 Task 3/4。

**檔案**：
- `src/renderer/src/store/slices/...`：`isActiveEnvironmentOffline(state)` 選擇器（active target 是 environment 且其連線狀態非 connected，依 `runtime-status` slice）。
- `src/renderer/src/components/sidebar/WorktreeList.tsx`（`handleConfirmDeleteProjectGroup` ~5565）：
  - group owner 是 active environment 且偵測離線 → 對話框直接走「本地強制移除」文案 → `forceRemoveProjectGroupLocally`，不空等 RPC。
  - 線上路徑回 `{ok:false, reason:'unreachable'}` → 跳「改為本地強制移除？（重連後自動同步）」確認 → `forceRemoveProjectGroupLocally`；`reason:'rejected'` → 維持現有錯誤 toast。
  - 成功本地移除後 toast 附「復原」action（`pendingProjectGroupDeletions:remove` + refetch 該 environment）。
- i18n：新文案加進 `src/renderer/src/i18n/locales/en.json`（及既有自動鍵慣例所需檔案），遵循既有 `translate('auto....', 'fallback')` 模式。

**測試**：仿既有 worktree-list 測試（如 `worktree-list-groups.test.ts`）：`isActiveEnvironmentOffline` 兩種情況；離線偵測 → 走 `forceRemoveProjectGroupLocally` 不呼叫遠端 delete；線上 `unreachable` → fallback；`rejected` → 維持錯誤 toast。

**驗收**：UX 兩軌正確；i18n 一致；測試全綠。

---

## 完成後

1. 全branch `npx vitest run --config config/vitest.config.ts`（相關檔）+ lint 全綠。
2. 最終整 branch 審查**交給 codex**（使用者指定「完全給 codex 檢查」），有 Critical/Important 再修。
3. 走 finishing-a-development-branch 決定整合方式。
