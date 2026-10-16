/** One tab's migration in an Orca-owned move; precomputed by the move coordinator. */
export type OpenFilePathRekey = {
  oldFileId: string
  newFileId: string
  oldFilePath: string
  newFilePath: string
  newRelativePath: string
  newLanguage?: string
  newMarkdownPreviewSourceFileId?: string
  /** Explicit rename of an untitled file consumes its untitled status. */
  consumeUntitled?: boolean
  /** The file moved out of its git owner's root, so the tab falls back to its tab owner. */
  clearGitOwner?: boolean
}

export type RekeyOpenFilesResult = { ok: true } | { ok: false; reason: 'collision' | 'stale' }
