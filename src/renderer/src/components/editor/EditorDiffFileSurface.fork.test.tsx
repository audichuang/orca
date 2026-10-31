// @vitest-environment happy-dom
import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { seedFolderDiffNote, renderedRepoNote } from './folder-diff-monaco.test-fixture'
import { DIFF, folderFile } from './folder-git-owner.test-fixture'
import { EditorDiffFileSurface } from './EditorDiffFileSurface'

afterEach(cleanup)
it('renders the repo review note on a single-file folder diff', async () => {
  seedFolderDiffNote()
  const file = folderFile({ relativePath: 'src/a.ts', diffSource: 'staged' })
  render(
    <EditorDiffFileSurface
      activeFile={file}
      diffContent={DIFF}
      editBuffer={undefined}
      resolvedLanguage="typescript"
      sideBySide
      viewStateScopeId="folder"
      diffViewStateKey="folder-diff"
      mdViewMode="source"
      isMarkdown={false}
      showMarkdownTableOfContents={false}
      onCloseMarkdownTableOfContents={() => {}}
      markdownAnnotationsEnabled={false}
      markdownDocuments={{
        markdownDocuments: [],
        openMarkdownDocument: async () => {},
        onOpenDocLink: () => {},
        previewProps: { markdownDocuments: [], onOpenDocument: async () => {} },
        mdSave: async () => true
      }}
      onContentChange={() => {}}
      onSave={async () => true}
      reloadContent={() => {}}
    />
  )
  await waitFor(() => expect(renderedRepoNote()).toContain('Review the repo change'), {
    timeout: 10000
  })
})
