import { describe, expect, it } from 'vitest'
import { joinRuntimePasteImagesDir } from './terminal-drop-worktree-path'

describe('joinRuntimePasteImagesDir', () => {
  it('builds a posix .orca/paste-images dir and trims trailing slash', () => {
    expect(joinRuntimePasteImagesDir('/remote/repo/')).toBe('/remote/repo/.orca/paste-images')
  })
  it('builds a windows-like dir with backslashes', () => {
    expect(joinRuntimePasteImagesDir('C:\\Users\\me\\repo')).toBe(
      'C:\\Users\\me\\repo\\.orca\\paste-images'
    )
  })
})
