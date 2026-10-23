// Fork-only: how the full Git Graph writes commit dates (row column, details pane).
import { formatUiRelativeTime, getUiRelativeTimeFormatter } from '@/i18n/relative-time-format'

/** "3 days ago" in the UI language; empty for a missing timestamp. */
export function formatGitGraphRelativeDate(timestamp: number | undefined): string {
  return timestamp == null || !Number.isFinite(timestamp)
    ? ''
    : formatUiRelativeTime(timestamp - Date.now())
}

const shortDateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'short',
  timeStyle: 'short'
})

// Why zero-padded and 24-hour: every row of a kind has the same width, so the column reads as one ruler.
const paddedDateFormatter = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
})
const paddedMonthDayFormatter = new Intl.DateTimeFormat(undefined, {
  month: '2-digit',
  day: '2-digit'
})
const paddedTimeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
})

function calendarDayOffset(date: Date, now: Date): number {
  const day = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((day - today) / 86_400_000)
}

// Why: Intl writes "today" for mid-sentence use; leading a row it reads as a label, like IntelliJ's.
function capitalize(word: string): string {
  return word.charAt(0).toLocaleUpperCase() + word.slice(1)
}

/**
 * Row date: "today"/"yesterday" or this year's month and day, then the time; an older year
 * shows only its date. The tooltip has the full timestamp and zone.
 */
export function formatGitGraphCompactDate(
  timestamp: number | undefined,
  now: Date = new Date()
): string {
  if (timestamp == null || !Number.isFinite(timestamp)) {
    return ''
  }
  const date = new Date(timestamp)
  const offset = calendarDayOffset(date, now)
  if (offset === 0 || offset === -1) {
    const word = capitalize(getUiRelativeTimeFormatter().format(offset, 'day'))
    return `${word} ${paddedTimeFormatter.format(date)}`
  }
  if (date.getFullYear() !== now.getFullYear()) {
    return paddedDateFormatter.format(date)
  }
  return `${paddedMonthDayFormatter.format(date)} ${paddedTimeFormatter.format(date)}`
}

export function formatGitGraphShortDate(timestamp: number | undefined): string {
  if (timestamp == null || !Number.isFinite(timestamp)) {
    return ''
  }
  return shortDateFormatter.format(new Date(timestamp))
}
