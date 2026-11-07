import { describe, expect, it } from 'vitest'
import { readGitCommandFailureMessage } from './git-command-failure-message'

describe('readGitCommandFailureMessage', () => {
  it("shows git's reason instead of the failed command line", () => {
    const error = new Error(
      "Error invoking remote method 'git:stage': Error: Command failed: git add -- :(literal)a.txt\nfatal: Unable to create '/repo/.git/index.lock': File exists.\n\nAnother git process seems to be running in this repository, or the lock file may be stale\n"
    )
    expect(readGitCommandFailureMessage(error)).toBe(
      "fatal: Unable to create '/repo/.git/index.lock': File exists."
    )
  })
})
