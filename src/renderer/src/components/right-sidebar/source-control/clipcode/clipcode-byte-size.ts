// Fork-only: the one size spelling every ClipCode tool shares (OpenIDEA `formatBytes` in clipNonText.tsx).
const UNITS = ['KB', 'MB', 'GB'] as const

/** "83 B" under 1024; above, one decimal below 10 and none from 10 up ("4.0 KB", "12 KB", "1.5 MB"). */
export function formatClipcodeBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024
    unit++
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${UNITS[unit]}`
}
