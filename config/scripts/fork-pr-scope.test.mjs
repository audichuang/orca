import { describe, expect, it } from 'vitest'
import { forkPrScope } from './fork-pr-scope.mjs'

describe('forkPrScope', () => {
  it('skips the heavy jobs only when every path is documentation', () => {
    expect(forkPrScope(['FORK.md', 'AGENTS.md', 'docs/fork/x.md'])).toBe('docs')
    expect(forkPrScope(['FORK.md', 'Makefile'])).toBe('full')
  })

  it('runs everything for the pipeline skills, which unattended agents execute', () => {
    expect(forkPrScope(['.claude/skills/orca-fork-auto-rebase/SKILL.md'])).toBe('full')
  })

  it('runs everything when the detector found no paths', () => {
    expect(forkPrScope([])).toBe('full')
  })
})
