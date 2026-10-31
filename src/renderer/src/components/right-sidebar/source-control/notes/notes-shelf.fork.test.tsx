// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { useAppStore } from '@/store'
import {
  cleanupFolderSourceControl,
  FolderScope,
  FOLDER,
  resetFolderSourceControl,
  WORKTREE
} from '../panel/folder-source-control-test-fixture'
import { SourceControlNotesShelf } from './notes-shelf'

beforeEach(() => {
  resetFolderSourceControl()
})
afterEach(cleanupFolderSourceControl)

it('targets folder agents when sending notes from a repo shelf', () => {
  render(
    <FolderScope>
      <SourceControlNotesShelf
        activeWorktreeId={WORKTREE.id}
        activeGroupId={undefined}
        diffCommentsForActive={[
          {
            id: 'note',
            worktreeId: WORKTREE.id,
            filePath: 'a.ts',
            lineNumber: 1,
            body: 'Check this line.',
            side: 'modified',
            createdAt: 1
          }
        ]}
        diffCommentCount={1}
        diffCommentsExpanded={false}
        setDiffCommentsExpanded={() => {}}
        diffCommentsCopied={false}
        handleCopyDiffComments={async () => {}}
        setPendingDiffCommentsClear={() => {}}
        deleteDiffComment={() => {}}
        handleOpenComment={() => {}}
      />
    </FolderScope>
  )
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Send notes to an agent' }), {
    button: 0,
    ctrlKey: false
  })
  expect(useAppStore.getState().agentSendPopoverTargetMode).toMatchObject({
    worktreeId: FOLDER,
    prompt: expect.stringContaining('Check this line.')
  })
})
