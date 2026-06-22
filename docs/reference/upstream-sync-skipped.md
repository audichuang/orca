# 上游同步跳過記錄（Upstream Sync Skip Log）

> **用途**：本檔是這份 fork（`audichuang/orca`，主力分支 `stable` / `develop`）同步上游 `origin`（`stablyai/orca`）時的**決策日誌**。
> 每次從上游擇優合併，凡是「**刻意不合**」的 commit 都記在這裡，附上**為什麼跳過**與**未來要不要追、怎麼追**。
> 目的：避免每次同步又重新研究同一批 commit，也避免哪天不小心把已淘汰的上游架構合回來、抵銷本 fork 的優化。

---

## 2026-06-22 — 同步上游至 v1.4.91-rc.0

- **分歧基準（merge-base）**：`3117ebcb2` `release: v1.4.90-rc.2`
- **上游進度**：rc.2 → rc.3 → v1.4.90 → v1.4.91-rc.0（HEAD `c139c704a`）
- **本次落差**：上游獨有 40 個 commit（含 3 個 release tag、1 個空 commit）；實質 37 個
- **處置**：合 34 顆、決策性跳過 2 顆、空 commit 略過 1 顆
- **執行計畫**：`docs/superpowers/specs/2026-06-22-upstream-rc91-cherry-pick-plan.md`（local-only planning doc，依 `.gitignore` 的 `docs/**` 規則不進版控，僅本機保留）

### 決策性跳過（重要：以後也要持續跳過這條線）

| commit | PR | 標題 | 跳過原因 | 未來怎麼追 |
|---|---|---|---|---|
| `2ed4346c2` | #6020 | Coalesce renderer worktree change refreshes | **本 fork 已超越**。上游想用「per-repo enqueue queue + 2 參數 `handleWorktreesChanged`」解單一 checkout 變更爆發的 fan-out；本 fork 已用 `createKeyedRefreshScheduler`（200ms debounce + one-in-flight/dirty + **active-only gate** + background lane + lineage 去重）整套取代並**涵蓋面更廣、力道更強**。硬合會兩套 coalesce 疊加、且 runtime 路徑（`handleWorktreesChangedRuntime`，3 參數簽章）語意打架。 | **不追**。若想回收上游那段「Windows/OneDrive burst 去重」語意，只需在 `keyed-refresh-scheduler.ts` 補一個 trailing-dedupe 判斷，**不要**引入 `enqueue` queue。 |
| `c1e071870` | #6040 | Dispose worktree change refresh queues | **目標檔在本 fork 不存在**。此 commit 主體修的 `src/renderer/src/hooks/worktree-change-refresh-queue.{ts,test.ts}` 是本 fork 做多 server 優化時**已整個移除**的舊架構（`git ls-tree stable` 確認不存在）；它另在 `useIpcEvents.ts` 加 `dispose` 掛載點，也與本 fork 的 scheduler 區衝突（`git merge-tree` 實測）。它想解的「卸載後不該再 refresh」，本 fork 的 `worktreeRefreshScheduler.stop()` / `reposRefreshScheduler.stop()`（已推進 `unsubs`）已涵蓋。cherry-pick 無意義且必衝突。 | **不追**。已確認 scheduler 的 `stop()` 具備等同的 in-flight/trailing 丟棄語意。 |

### 架構分歧說明（這兩顆背後的根因）

上游維持的是 `worktreeChangeRefreshQueue`（per-repo 的 in-flight + queue coalesce）。
本 fork 在多 server 事件風暴優化時，把它**整套換成** `keyed-refresh-scheduler.ts`：

- `worktreeRefreshScheduler.request(key)` / `reposRefreshScheduler.request(key)`：200ms debounce、一個在飛 + dirty 重跑
- **active-only gate**：非 active server 只 `markRuntimeEnvironmentDirty`，不立即重掃
- background lane + 每環境單次 host-correct lineage fetch、lineage 去重
- `handleWorktreesChanged` 簽章從上游的 `(repoId, renamed)` 改為 `(environmentId, repoId, renamed)`，runtime 路徑改走全新的 `handleWorktreesChangedRuntime`（含 diff-based purge）

**判準（未來每次同步都套用）**：上游凡是觸及 `worktree-change-refresh-queue.*`、`handleWorktreesChanged` 2 參數簽章、或在 `useIpcEvents.ts` 的 worktreesChanged/reposChanged handler 重新引入 `enqueue` 機制的 commit → **預設跳過**，並評估其「想解的問題」是否需要在 `keyed-refresh-scheduler.ts` 補一小段邏輯即可。

### 非決策性略過（無內容，僅備查）

| commit | PR | 標題 | 說明 |
|---|---|---|---|
| `8bf99dae4` | #5972 | Emit checking-for-update event in updater test | **空 commit**（`git diff 8bf99dae4^ 8bf99dae4` 無 tree 差異）。cherry-pick 為 no-op，略過即可，非決策性。 |
| `c0f1d386c` / `9534c7553` / `423ccaff7` | — | release: v1.4.91-rc.0 / v1.4.90 / v1.4.90-rc.3 | release tag commit，不 cherry-pick。 |

---

<!-- 下次同步時，在上方新增一個 "## YYYY-MM-DD — 同步上游至 vX.Y.Z" 區塊，沿用相同欄位。 -->
