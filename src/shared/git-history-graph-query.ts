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
import { isSafeGitRefName } from './git-status-upstream-ref'
import { isSafeGitRemoteName } from './git-push-target-validation'

// Why so strict: these become git argv; a glob, rev syntax or leading dash would widen or redirect the walk.
function isWalkableRef(ref: string): boolean {
  return /^refs\/(heads|remotes|tags)\//.test(ref) && !ref.includes('/-') && isSafeGitRefName(ref)
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
    const refs = (request.refs ?? []).filter(isWalkableRef)
    return refs.length > 0 ? ['--end-of-options', ...refs] : []
  }
  if (request.mode === 'head') {
    return ['--end-of-options', 'HEAD']
  }
  const source = request.source ?? { local: true, remotes: [] }
  const wanted = source.remotes === 'all' ? knownRemotes : source.remotes
  const remotes = wanted.filter(
    (remote) => isSafeGitRemoteName(remote) && knownRemotes.includes(remote)
  )
  return [
    ...(source.local ? ['--branches'] : []),
    ...remotes.map((remote) => `--remotes=${remote}`),
    ...(source.tags ? ['--tags'] : []),
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
      .filter((name) => name && isSafeGitRemoteName(name))
      .sort()
  } catch {
    return []
  }
}

async function listRefLines(
  git: GitHistoryExecutor,
  cwd: string,
  sort: string,
  namespaces: string[]
): Promise<string[]> {
  try {
    const { stdout } = await git(
      [
        'for-each-ref',
        `--sort=${sort}`,
        `--count=${GIT_HISTORY_GRAPH_REF_LIST_LIMIT}`,
        '--format=%(refname)%00%(refname:short)%00%(symref)',
        ...namespaces
      ],
      cwd
    )
    return stdout.split(/\r?\n/).filter(Boolean)
  } catch {
    return []
  }
}

async function listGraphRefLines(
  git: GitHistoryExecutor,
  cwd: string,
  listTags: boolean
): Promise<string[]> {
  // Why apart: tags sort by when they were made, and must not crowd branches out of the count.
  const [branches, tags] = await Promise.all([
    listRefLines(git, cwd, '-committerdate', ['refs/heads', 'refs/remotes']),
    listTags ? listRefLines(git, cwd, '-creatordate', ['refs/tags']) : Promise.resolve([])
  ])
  return [...branches, ...tags]
}

function toBranchRefOptions(
  lines: readonly string[],
  remotes: readonly string[]
): GitHistoryGraphRefOption[] {
  // Why longest first: a remote may itself contain slashes.
  const remotesLongestFirst = [...remotes].sort((a, b) => b.length - a.length)
  const refs: GitHistoryGraphRefOption[] = []
  for (const line of lines) {
    const [fullName, name, symref] = line.split('\0')
    if (!fullName || !name || symref || !isWalkableRef(fullName)) {
      continue
    }
    if (fullName.startsWith('refs/heads/')) {
      refs.push({ fullName, name, category: 'branches' })
      continue
    }
    if (fullName.startsWith('refs/tags/')) {
      refs.push({ fullName, name, category: 'tags' })
      continue
    }
    const remote = remotesLongestFirst.find((candidate) =>
      fullName.startsWith(`refs/remotes/${candidate}/`)
    )
    refs.push({ fullName, name, category: 'remote branches', ...(remote ? { remote } : {}) })
  }
  return refs
}

async function walkGraphLog(
  git: GitHistoryExecutor,
  cwd: string,
  request: GitHistoryGraphRequest,
  revisions: string[],
  limit: number
): Promise<{ items: GitHistoryResult['items']; hasMore: boolean }> {
  if (revisions.length === 0) {
    return { items: [], hasMore: false }
  }
  const search = buildSearchArgs(request)
  const { stdout } = await git(
    [
      'log',
      '--no-show-signature',
      '--no-color',
      `--format=${GIT_HISTORY_COMMIT_FORMAT}`,
      '-z',
      '--topo-order',
      '--decorate=full',
      // Why: a picked branch deleted since, or an unborn HEAD, should list nothing rather than fail.
      '--ignore-missing',
      `-n${limit + 1}`,
      ...search.options,
      ...revisions,
      ...search.paths
    ],
    cwd
  )
  const parsed = parseGitHistoryLog(stdout)
  return { items: parsed.slice(0, limit), hasMore: parsed.length > limit }
}

export async function loadGitHistoryGraphFromExecutor(
  git: GitHistoryExecutor,
  cwd: string,
  options: GitHistoryOptions & { graph: GitHistoryGraphRequest }
): Promise<GitHistoryResult> {
  const request = options.graph
  const limit = clampGraphLimit(request.limit ?? options.limit)
  const remotesPromise = listRemotes(git, cwd)
  // Why: only `all` needs the remote list to build its argv; the other walks start right away.
  const logPromise =
    request.mode === 'all'
      ? remotesPromise.then((remotes) =>
          walkGraphLog(git, cwd, request, buildGitHistoryGraphLogRevisions(request, remotes), limit)
        )
      : walkGraphLog(git, cwd, request, buildGitHistoryGraphLogRevisions(request, []), limit)
  // Why reuse upstream for -n1: it owns the current/upstream/base ref metadata the graph colors by.
  const [meta, remotes, refLines, log] = await Promise.all([
    loadGitHistoryFromExecutor(git, cwd, { limit: 1, baseRef: options.baseRef }),
    remotesPromise,
    listGraphRefLines(git, cwd, request.listTags === true),
    logPromise
  ])
  return {
    ...meta,
    items: log.items,
    // Why: incoming/outgoing boundary rows describe HEAD vs upstream, which the multi-branch walk already draws.
    hasIncomingChanges: false,
    hasOutgoingChanges: false,
    hasMore: log.hasMore,
    limit,
    graph: { mode: request.mode, refs: toBranchRefOptions(refLines, remotes), remotes, limit }
  }
}
