import type {
  GitHistoryExecutor,
  GitHistoryOptions,
  GitHistoryResult
} from '../../shared/git-history'
import { loadGitHistoryFromExecutor } from '../../shared/git-history'
import { loadGitHistoryGraphFromExecutor } from '../../shared/git-history-graph-query'
import type { GitRuntimeOptions } from './git-runtime-options'
import { gitOptionsForWorktree } from './git-runtime-options'
import { gitExecFileAsync } from './runner'

export async function getHistory(
  worktreePath: string,
  options: GitHistoryOptions & GitRuntimeOptions = {}
): Promise<GitHistoryResult> {
  const git: GitHistoryExecutor = (args, cwd) =>
    gitExecFileAsync(args, gitOptionsForWorktree(cwd, options))
  const { graph } = options
  return graph
    ? loadGitHistoryGraphFromExecutor(git, worktreePath, { ...options, graph })
    : loadGitHistoryFromExecutor(git, worktreePath, options)
}
