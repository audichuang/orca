// Bodies ClipCode writers (this port, the VS Code and IntelliJ plugins) emit instead of file content.
export const CLIPCODE_SKIPPED_BODY_PREFIX = '// File skipped: '
export const DELETED_FILE_MARKER = '// This file has been deleted in this change'

const ASCII_WHITESPACE = /^[ \t\n\v\f\r]+|[ \t\n\v\f\r]+$/g

function asciiTrim(value: string): string {
  return value.replace(ASCII_WHITESPACE, '')
}

/**
 * True when an entry's FIRST line is a copy-side placeholder, so restoring it would replace real
 * bytes with a comment. Mirrors RestorePlan.kt / restore.ts isPlaceholderBody (ClipCode 1.2.15).
 */
export function isClipcodePlaceholderBody(content: string): boolean {
  // Why: ASCII-only trim like the plugins; String.trim also strips U+FEFF and would disagree on what gets written.
  const body = asciiTrim(content)
  const lineBreak = body.indexOf('\n')
  const first = asciiTrim(lineBreak === -1 ? body : body.slice(0, lineBreak))
  return (
    first.startsWith(CLIPCODE_SKIPPED_BODY_PREFIX) ||
    first === '// Unable to read file content' ||
    first === '// Error reading file content'
  )
}
