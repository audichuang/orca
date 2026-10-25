// Copied from upstream components/github/github-user-avatar.tsx initialsFor (module-private there); re-sync on rebase.
/** A 1-2 character initials placeholder from a display name or login. */
export function initialsFor(login: string, name?: string | null): string {
  const source = (name?.trim() || login).trim()
  if (!source) {
    return '?'
  }
  // Why code points and letters/digits only: an emoji-led name must not yield a broken surrogate half.
  const alnum = (word: string): string[] => [...word].filter((ch) => /[\p{L}\p{N}]/u.test(ch))
  const parts = source.split(/\s+/).filter(Boolean)
  const letters =
    parts.length >= 2
      ? parts
          .map((word) => alnum(word)[0])
          .filter(Boolean)
          .slice(0, 2)
          .join('')
      : alnum(source).slice(0, 2).join('')
  return letters.toUpperCase() || '?'
}
