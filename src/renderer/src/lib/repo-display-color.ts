// Fork-only: the colour Git surfaces use to tell many repos apart.
import { useCallback } from 'react'
import { DEFAULT_REPO_BADGE_COLOR } from '../../../shared/constants'
import { resolveRepoBadgeColor } from '../../../shared/repo-badge-color'
import type { Repo } from '../../../shared/repo-types'
import { useAppStore } from '@/store'

/**
 * The repo's own badge colour; a repo left on the neutral default gets a hue from its place in the
 * repo list, since most repos are never given one and a long list would be all grey.
 * Why list order, not a hash: golden-angle steps keep neighbours far apart, and repos are appended,
 * so adding one never recolours the others.
 */
export function repoDisplayColor(
  repo: Pick<Repo, 'id' | 'badgeColor'>,
  repos: readonly Pick<Repo, 'id'>[]
): string {
  const color = resolveRepoBadgeColor(repo.badgeColor)
  if (color !== DEFAULT_REPO_BADGE_COLOR) {
    return color
  }
  const index = Math.max(
    0,
    repos.findIndex((entry) => entry.id === repo.id)
  )
  return `hsl(${Math.round((index * 137.508) % 360)} 55% 52%)`
}

export function useRepoDisplayColor(): (repo: Pick<Repo, 'id' | 'badgeColor'>) => string {
  const repos = useAppStore((s) => s.repos)
  return useCallback((repo) => repoDisplayColor(repo, repos), [repos])
}
