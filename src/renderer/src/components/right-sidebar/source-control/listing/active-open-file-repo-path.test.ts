import { describe, expect, it } from 'vitest'
import { resolveActiveFileRepoRelativePath } from './active-open-file-repo-path'

const outer = { repoWorktreeId: 'docs', repoPath: '/w/docs-site', tabWorktreeId: 'folder' }

describe('resolveActiveFileRepoRelativePath', () => {
  it('keeps the tab path in a plain repo workspace', () => {
    expect(
      resolveActiveFileRepoRelativePath({
        file: { filePath: '/w/docs-site/index.md', relativePath: 'index.md' },
        tabWorktreeId: 'docs',
        repoWorktreeId: 'docs',
        repoPath: '/w/docs-site'
      })
    ).toBe('index.md')
  })

  it('does not match a nested repo file owned by another repo', () => {
    expect(
      resolveActiveFileRepoRelativePath({
        ...outer,
        file: {
          filePath: '/w/docs-site/plugins/inner/index.md',
          relativePath: 'index.md',
          gitWorktreeId: 'inner'
        }
      })
    ).toBeNull()
  })

  it('matches a file owned by this repo', () => {
    expect(
      resolveActiveFileRepoRelativePath({
        ...outer,
        file: { filePath: '/w/docs-site/index.md', relativePath: 'index.md', gitWorktreeId: 'docs' }
      })
    ).toBe('index.md')
  })

  it('derives the repo-relative path for an ownerless folder tab', () => {
    expect(
      resolveActiveFileRepoRelativePath({
        ...outer,
        file: {
          filePath: '/w/docs-site/plugins/inner/index.md',
          relativePath: 'docs-site/plugins/inner/index.md'
        }
      })
    ).toBe('plugins/inner/index.md')
    expect(
      resolveActiveFileRepoRelativePath({
        ...outer,
        file: { filePath: '/w/api/server.ts', relativePath: 'api/server.ts' }
      })
    ).toBeNull()
  })
})
