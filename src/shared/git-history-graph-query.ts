// Fork-only: walks several branches for the Source Control graph. Upstream's loader stays HEAD-only.
import { loadGitHistoryFromExecutor } from './git-history'
import { GIT_HISTORY_COMMIT_FORMAT, parseGitHistoryLog } from './git-history-log-parser'
import {
  GIT_HISTORY_GRAPH_MAX_LIMIT,
  GIT_HISTORY_GRAPH_REF_LIST_LIMIT,
  type GitHistoryGraphRefOption,
  type GitHistoryGraphRequest
} from './git-history-graph-query-types'
import {
  GIT_HISTORY_DEFAULT_LIMIT,
  type GitHistoryExecutor,
  type GitHistoryOptions,
  type GitHistoryResult
} from './git-history-types'

// Why so strict: these become git argv; a glob or rev-syntax character would widen or redirect the walk.
const SAFE_REMOTE_NAME = /^[A-Za-z0-9_.][A-Za-z0-9_./-]*$/
const UNSAFE_REF_CHARS = /[\s~^:?*[\\]|\.\.|@\{|\/-/

function isWalkableBranchRef(ref: string): boolean {
  return /^refs\/(heads|remotes)\/[^/]/.test(ref) && !UNSAFE_REF_CHARS.test(ref)
}

function clampGraphLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) {
    return GIT_HISTORY_DEFAULT_LIMIT
  }
  return Math.min(GIT_HISTORY_GRAPH_MAX_LIMIT, Math.max(1, Math.trunc(limit ?? 0)))
}

/** The revision part of the `git log` argv; never `--all`, which would also walk stash, notes and PR refs. */
export function buildGitHistoryGraphLogRevisions(
  request: GitHistoryGraphRequest,
  knownRemotes: readonly string[]
): string[] {
  if (request.mode === 'refs') {
    const refs = (request.refs ?? []).filter(isWalkableBranchRef)
    return refs.length > 0 ? ['--end-of-options', ...refs] : []
  }
  if (request.mode === 'head') {
    return ['--end-of-options', 'HEAD']
  }
  const source = request.source ?? { local: true, remotes: [] }
  const wanted = source.remotes === 'all' ? knownRemotes : source.remotes
  const remotes = wanted.filter(
    (remote) => SAFE_REMOTE_NAME.test(remote) && knownRemotes.includes(remote)
  )
  return [
    ...(source.local ? ['--branches'] : []),
    ...remotes.map((remote) => `--remotes=${remote}`),
    // Why HEAD: a detached HEAD belongs to no branch but is still the local work.
    ...(source.local ? ['--end-of-options', 'HEAD'] : [])
  ]
}

function buildSearchArgs(request: GitHistoryGraphRequest): { options: string[]; paths: string[] } {
  const text = request.search?.text?.trim()
  const author = request.search?.author?.trim()
  const path = request.search?.path?.trim().replace(/^\.\//, '')
  const options = [
    ...(text ? [`--grep=${text}`] : []),
    ...(author ? [`--author=${author}`] : []),
    ...(text || author ? ['-i', '--fixed-strings'] : [])
  ]
  return { options, paths: path ? ['--', `:(literal)${path}`] : [] }
}

async function listRemotes(git: GitHistoryExecutor, cwd: string): Promise<string[]> {
  try {
    const { stdout } = await git(['remote'], cwd)
    return stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((name) => name && SAFE_REMOTE_NAME.test(name))
      .sort()
  } catch {
    return []
  }
}

async function listBranchRefs(
  git: GitHistoryExecutor,
  cwd: string,
  remotes: readonly string[]
): Promise<{ refs: GitHistoryGraphRefOption[]; truncated: boolean }> {
  try {
    const { stdout } = await git(
      [
        'for-each-ref',
        '--sort=-committerdate',
        `--count=${GIT_HISTORY_GRAPH_REF_LIST_LIMIT + 1}`,
        '--format=%(refname)%00%(refname:short)%00%(symref)',
        'refs/heads',
        'refs/remotes'
      ],
      cwd
    )
    const lines = stdout.split(/\r?\n/).filter(Boolean)
    const refs: GitHistoryGraphRefOption[] = []
    for (const line of lines.slice(0, GIT_HISTORY_GRAPH_REF_LIST_LIMIT)) {
      const [fullName, name, symref] = line.split('\0')
      if (!fullName || !name || symref || !isWalkableBranchRef(fullName)) {
        continue
      }
      if (fullName.startsWith('refs/heads/')) {
        refs.push({ fullName, name, category: 'branches' })
        continue
      }
      // Why longest match: a remote may itself contain slashes.
      const remote = [...remotes]
        .sort((a, b) => b.length - a.length)
        .find((candidate) => fullName.startsWith(`refs/remotes/${candidate}/`))
      refs.push({ fullName, name, category: 'remote branches', ...(remote ? { remote } : {}) })
    }
    return { refs, truncated: lines.length > GIT_HISTORY_GRAPH_REF_LIST_LIMIT }
  } catch {
    return { refs: [], truncated: false }
  }
}

export async function loadGitHistoryGraphFromExecutor(
  git: GitHistoryExecutor,
  cwd: string,
  options: GitHistoryOptions & { graph: GitHistoryGraphRequest }
): Promise<GitHistoryResult> {
  const request = options.graph
  const limit = clampGraphLimit(request.limit ?? options.limit)
  // Why reuse upstream for -n1: it owns the current/upstream/base ref metadata the graph colors by.
  const [meta, remotes] = await Promise.all([
    loadGitHistoryFromExecutor(git, cwd, { limit: 1, baseRef: options.baseRef }),
    listRemotes(git, cwd)
  ])
  const branchRefs = await listBranchRefs(git, cwd, remotes)
  const revisions = buildGitHistoryGraphLogRevisions(request, remotes)
  const search = buildSearchArgs(request)
  let items: GitHistoryResult['items'] = []
  let hasMore = false
  if (revisions.length > 0) {
    const { stdout } = await git(
      [
        'log',
        '--no-show-signature',
        '--no-color',
        `--format=${GIT_HISTORY_COMMIT_FORMAT}`,
        '-z',
        '--topo-order',
        '--decorate=full',
        `-n${limit + 1}`,
        ...search.options,
        ...revisions,
        ...search.paths
      ],
      cwd
    )
    const parsed = parseGitHistoryLog(stdout)
    items = parsed.slice(0, limit)
    hasMore = parsed.length > limit
  }
  return {
    ...meta,
    items,
    // Why: incoming/outgoing boundary rows describe HEAD vs upstream, which the multi-branch walk already draws.
    hasIncomingChanges: false,
    hasOutgoingChanges: false,
    hasMore,
    limit,
    graph: {
      mode: request.mode,
      refs: branchRefs.refs,
      refsTruncated: branchRefs.truncated,
      remotes,
      limit
    }
  }
}
