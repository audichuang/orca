// Fork-only: Up/Down/Home/End movement shared by the full Git Graph's commit list and branch tree.

/** Index the key moves to, clamped to the list; null for keys this does not handle. */
export function rovingKeyTarget(key: string, index: number, length: number): number | null {
  if (length === 0) {
    return null
  }
  switch (key) {
    case 'ArrowDown':
      return Math.min(length - 1, index + 1)
    case 'ArrowUp':
      return Math.max(0, index - 1)
    case 'Home':
      return 0
    case 'End':
      return length - 1
    default:
      return null
  }
}
