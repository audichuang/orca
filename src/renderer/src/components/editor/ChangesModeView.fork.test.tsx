// @vitest-environment happy-dom
import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import {
  mountedDiffEditors,
  seedFolderDiffNote,
  renderedRepoNote
} from './folder-diff-monaco.test-fixture'
import { DIFF, folderFile } from './folder-git-owner.test-fixture'
import { ChangesModeView } from './ChangesModeView'

afterEach(cleanup)
it('shows repo notes and restores the live draft into a retained Changes model', async () => {
  seedFolderDiffNote()
  render(
    <ChangesModeView
      activeFile={folderFile({ mode: 'edit', relativePath: 'src/a.ts' })}
      dc={DIFF}
      modifiedContent="live draft"
      activeConflictEntry={null}
      resolvedLanguage="typescript"
      sideBySide
      viewStateScopeId="folder"
      diffViewStateKey="folder-changes"
      onContentChange={() => {}}
      onSave={async () => true}
    />
  )
  await waitFor(() => expect(renderedRepoNote()).toContain('Review the repo change'), {
    timeout: 10000
  })
  expect(mountedDiffEditors[0]?.getValue()).toBe('live draft')
})
