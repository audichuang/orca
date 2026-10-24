import { describe, expect, it } from 'vitest'
import { scanNestedRepos } from './nested-repo-discovery'

function posixTestFilesystem(args: {
  directories: Map<string, string[]>
  gitRepos: Set<string>
  files?: Map<string, string>
}) {
  return {
    readDirectory: async (dirPath: string) =>
      (args.directories.get(dirPath) ?? []).map((name) => ({
        name,
        isDirectory: !args.files?.has(`${dirPath}/${name}`)
      })),
    readTextFile: async (path: string) => {
      const content = args.files?.get(path)
      if (content === undefined) {
        throw new Error('not found')
      }
      return content
    },
    joinPath: (parentPath: string, childName: string) => `${parentPath}/${childName}`,
    basename: (path: string) => path.split('/').at(-1) ?? path,
    hasGitMarker: (path: string) => args.gitRepos.has(path),
    isSelectedPathGitRepo: (path: string) => args.gitRepos.has(path)
  }
}

describe('scanNestedRepos', () => {
  describe('descendIntoRepos', () => {
    const directories = new Map([
      ['/cat', ['bfs', 'docs']],
      ['/cat/docs', ['etf', 'notes']],
      ['/cat/docs/etf', ['sql']]
    ])
    const gitRepos = new Set(['/cat/bfs', '/cat/docs', '/cat/docs/etf'])

    it('stops at the first repo by default', async () => {
      const result = await scanNestedRepos({
        path: '/cat',
        filesystem: posixTestFilesystem({ directories, gitRepos })
      })

      expect(result.repos.map((repo) => repo.path)).toEqual(['/cat/bfs', '/cat/docs'])
    })

    it('also finds repos nested inside repos when asked', async () => {
      const result = await scanNestedRepos({
        path: '/cat',
        options: { descendIntoRepos: true },
        filesystem: posixTestFilesystem({ directories, gitRepos })
      })

      expect(result.selectedPathKind).toBe('non_git_folder')
      expect(result.repos.map((repo) => repo.path)).toEqual([
        '/cat/bfs',
        '/cat/docs',
        '/cat/docs/etf'
      ])
    })

    it('scans inside a selected repo instead of returning early', async () => {
      const result = await scanNestedRepos({
        path: '/cat/docs',
        options: { descendIntoRepos: true },
        filesystem: posixTestFilesystem({ directories, gitRepos })
      })

      expect(result.selectedPathKind).toBe('git_repo')
      expect(result.repos.map((repo) => repo.path)).toEqual(['/cat/docs/etf'])
    })
  })
})
