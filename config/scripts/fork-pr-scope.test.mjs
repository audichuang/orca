import { describe, expect, it } from 'vitest'
import { forkPrScope } from './fork-pr-scope.mjs'

describe('forkPrScope', () => {
  it('skips the heavy jobs only when every path is documentation', () => {
    expect(forkPrScope(['FORK.md', 'AGENTS.md', 'docs/fork/x.md'])).toBe('docs')
    expect(forkPrScope(['FORK.md', 'Makefile'])).toBe('full')
  })

  it.each([
    '.claude/skills/orca-fork-auto-rebase/SKILL.md',
    '.github/workflows/fork-pr.yml',
    'config/scripts/fork-pr-scope.mjs',
    'docs/site/package.json',
    'Makefile',
    'package.json'
  ])('runs everything for %s, even beside docs', (file) => {
    expect(forkPrScope(['FORK.md', file])).toBe('full')
  })

  it('runs everything when the detector found no paths', () => {
    expect(forkPrScope([])).toBe('full')
  })
})
