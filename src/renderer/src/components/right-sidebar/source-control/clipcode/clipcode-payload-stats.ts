// Behavioral port of ClipCodeVSCode src/copy.ts payloadStats; the same numbers must show in every tool.
export type ClipcodePayloadStats = {
  chars: number
  lines: number
  words: number
  tokens: number
}

export const CLIPCODE_TOKEN_WARN_THRESHOLD = 1_000_000
export const CLIPCODE_TOKEN_DANGER_THRESHOLD = 2_000_000

export function payloadStats(text: string): ClipcodePayloadStats {
  let words = 0
  let punctuation = 0
  let newlines = 0
  let inWord = false
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (code === 0x0a) {
      newlines++
    }
    // Space plus the contiguous 0x09-0x0D block: exactly the six ASCII separators, nothing Unicode.
    if (code === 0x20 || (code >= 0x09 && code <= 0x0d)) {
      inWord = false
      continue
    }
    if (!inWord) {
      inWord = true
      words++
    }
    // ; , ( ) { } [ ]
    if (
      code === 0x3b ||
      code === 0x2c ||
      code === 0x28 ||
      code === 0x29 ||
      code === 0x7b ||
      code === 0x7d ||
      code === 0x5b ||
      code === 0x5d
    ) {
      punctuation++
    }
  }
  return {
    chars: text.length,
    lines: text.length === 0 ? 0 : newlines + 1,
    words,
    tokens: words + punctuation
  }
}

/** Pinned to en-US so every tool renders `1,234` the same way. */
export function formatClipcodeCount(value: number): string {
  return value.toLocaleString('en-US')
}

export function formatClipcodeStatsLine(stats: ClipcodePayloadStats): string {
  return (
    `${formatClipcodeCount(stats.chars)} chars · ${formatClipcodeCount(stats.lines)} lines · ` +
    `${formatClipcodeCount(stats.words)} words · ~${formatClipcodeCount(stats.tokens)} tokens.`
  )
}
