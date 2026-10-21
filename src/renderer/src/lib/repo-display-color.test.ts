import { describe, expect, it } from 'vitest'
import { DEFAULT_REPO_BADGE_COLOR, REPO_COLORS } from '../../../shared/constants'
import { repoDisplayColor } from './repo-display-color'

const repos = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
const plain = (id: string) => ({ id, badgeColor: DEFAULT_REPO_BADGE_COLOR })

describe('repoDisplayColor', () => {
  it('keeps a colour the user picked', () => {
    expect(repoDisplayColor({ id: 'a', badgeColor: REPO_COLORS[3] }, repos)).toBe(REPO_COLORS[3])
    expect(repoDisplayColor({ id: 'a', badgeColor: '#123456' }, repos)).toBe('#123456')
  })

  it('spreads default-coloured repos around the wheel by list order, stable when one is added', () => {
    const hues = repos.map((repo) => repoDisplayColor(plain(repo.id), repos))
    expect(new Set(hues).size).toBe(3)
    expect(hues[0]).toBe('hsl(0 55% 52%)')
    expect(repoDisplayColor(plain('b'), [...repos, { id: 'd' }])).toBe(hues[1])
  })
})
