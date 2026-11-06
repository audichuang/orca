import { describe, expect, it } from 'vitest'
import { forkBaselineAdditions, upstreamE2eProblems } from './fork-test-inventory.mjs'

const GOOD = 'tests/e2e/good.spec.ts'
const env = {
  exists: (path) => path !== 'tests/e2e/gone.spec.ts',
  forkAdded: new Set(['tests/e2e/fork-own.spec.ts']),
  read: (path) => (path === 'tests/e2e/headful.spec.ts' ? "test('x @headful', () => {})" : '')
}

describe('upstreamE2eProblems', () => {
  it('accepts a plain existing upstream spec', () => {
    expect(upstreamE2eProblems([GOOD], env)).toEqual([])
  })

  it.each([
    ['a missing file', ['tests/e2e/gone.spec.ts'], 'missing'],
    ['a duplicate', [GOOD, GOOD], 'listed twice'],
    ['a spec the fork added', ['tests/e2e/fork-own.spec.ts'], 'added by the fork'],
    ['a @headful spec', ['tests/e2e/headful.spec.ts'], '@headful'],
    ['a regex character', ['tests/e2e/a+b.spec.ts'], 'plain tests/e2e']
  ])('reports %s', (_name, lines, expected) => {
    const problems = upstreamE2eProblems(lines, env)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain(expected)
  })
})

describe('forkBaselineAdditions', () => {
  it('reports added baseline lines and ignores removals and headers', () => {
    const diff = ['--- a/b', '+++ b/b', '@@ -1 +1 @@', '-1 rule:old', '+1 rule:new'].join('\n')
    expect(forkBaselineAdditions(diff)).toHaveLength(1)
    expect(forkBaselineAdditions('')).toEqual([])
  })
})
