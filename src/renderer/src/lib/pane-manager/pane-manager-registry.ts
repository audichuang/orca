type RegisteredPaneManager = {
  resetWebglTextureAtlases(): void
  fitAllPanes?: () => void
  refreshAllPanes?: () => void
}

const liveManagers = new Set<RegisteredPaneManager>()

export function registerLivePaneManager(manager: RegisteredPaneManager): void {
  liveManagers.add(manager)
}

export function unregisterLivePaneManager(manager: RegisteredPaneManager): void {
  liveManagers.delete(manager)
}

/**
 * Resets the WebGL glyph atlases of every live pane manager, not just one.
 *
 * Why: @xterm/addon-webgl keeps a module-global atlas cache, so terminals with
 * identical font configs share one glyph texture atlas. Clearing it through a
 * single manager invalidates the cached glyph coordinates of every other
 * sharing terminal without rebuilding their render models, which paints them
 * as garbled glyphs. Recovery resets must therefore rebuild all terminals.
 */
export function resetAllTerminalWebglAtlases(): void {
  for (const manager of liveManagers) {
    try {
      manager.resetWebglTextureAtlases()
    } catch {
      // Why: stale WebGL recovery is best-effort during pane teardown; one
      // disposed manager should not prevent sibling terminals from repainting.
    }
  }
}

export function refitAndRefreshAllTerminalPanes(): void {
  for (const manager of liveManagers) {
    try {
      // Why: after bulk desktop restore, background panes may have correct
      // cols/rows but a stale xterm renderer until focus forces a repaint.
      manager.fitAllPanes?.()
      manager.refreshAllPanes?.()
    } catch {
      // Why: restore-all is best-effort across live managers during teardown.
    }
  }
}

/**
 * Repaints every live pane's renderer WITHOUT refitting (no resize).
 *
 * Why: a manual "Refresh Display" must not change geometry. A refit can resize
 * cols and reflow the buffer, which leaves already-wrapped scrollback at the
 * old width (a narrow/garbled top above normal-width new output). Repaint-only
 * recovers a stale/garbled renderer while preserving the current dimensions.
 */
export function refreshAllTerminalPanes(): void {
  for (const manager of liveManagers) {
    try {
      manager.refreshAllPanes?.()
    } catch {
      // Why: best-effort across live managers during mount/teardown.
    }
  }
}
