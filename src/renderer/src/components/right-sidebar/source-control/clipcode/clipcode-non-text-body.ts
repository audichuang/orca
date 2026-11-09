// Non-text file body (placeholder line + wrapped Base64); port of OpenIDEA crates/ide-clip/src/nontext.rs.
import { encodeBase64Bytes } from '@/lib/base64-bytes'
import { sha256 } from '../../../../../../shared/sha256'

export const NON_TEXT_BASE64_LINE_LENGTH = 76

// `[0-9]`, never `\d`, to match the Rust regex on every implementation.
const PLACEHOLDER_LINE =
  /^\/\/ File skipped: non-text file, ([0-9]+) bytes, sha256 ([0-9a-f]{64}); base64 follows$/
const U64_MAX = 2n ** 64n - 1n
// Rust u8::is_ascii_whitespace: space, \t, \n, \f, \r (not \v).
const BASE64_WHITESPACE = /[ \t\n\f\r]/g
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const BASE64_VALUES = new Map([...BASE64_ALPHABET].map((char, index) => [char, index]))

export type NonTextHeader = { size: bigint; sha256: string }
export type NonTextError = 'base64' | 'size' | 'sha256'
export type NonTextBody = { ok: true; bytes: Uint8Array } | { ok: false; error: NonTextError }

export function sha256Hex(bytes: Uint8Array): string {
  return Array.from(sha256(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function nonTextPlaceholderLine(size: number, shaHex: string): string {
  return `// File skipped: non-text file, ${size} bytes, sha256 ${shaHex}; base64 follows`
}

/** Placeholder line followed by the standard Base64 of `bytes`, wrapped at 76. */
export function nonTextBodyLines(bytes: Uint8Array): string[] {
  const encoded = encodeBase64Bytes(bytes)
  const lines = [nonTextPlaceholderLine(bytes.length, sha256Hex(bytes))]
  for (let index = 0; index < encoded.length; index += NON_TEXT_BASE64_LINE_LENGTH) {
    lines.push(encoded.slice(index, index + NON_TEXT_BASE64_LINE_LENGTH))
  }
  return lines
}

/** Recognizes the placeholder line (one trailing `\r` dropped first). */
export function parseNonTextPlaceholderLine(line: string): NonTextHeader | undefined {
  const match = PLACEHOLDER_LINE.exec(line.endsWith('\r') ? line.slice(0, -1) : line)
  if (!match) {
    return undefined
  }
  const size = BigInt(match[1])
  return size > U64_MAX ? undefined : { size, sha256: match[2] }
}

// Same strictness as Rust base64 STANDARD: canonical padding, no stray `=`, zero unused bits.
function decodeStrictBase64(text: string): Uint8Array | undefined {
  if (text.length % 4 !== 0) {
    return undefined
  }
  const padding = text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0
  const bytes = new Uint8Array((text.length / 4) * 3 - padding)
  let out = 0
  for (let index = 0; index < text.length; index += 4) {
    const isLast = index + 4 === text.length
    const pad = isLast ? padding : 0
    let group = 0
    for (let offset = 0; offset < 4; offset += 1) {
      const value = offset < 4 - pad ? BASE64_VALUES.get(text[index + offset]) : 0
      if (value === undefined) {
        return undefined
      }
      group = (group << 6) | value
    }
    if ((pad === 1 && (group & 0xff) !== 0) || (pad === 2 && (group & 0xffff) !== 0)) {
      return undefined
    }
    const decoded = [(group >> 16) & 0xff, (group >> 8) & 0xff, group & 0xff]
    for (let offset = 0; offset < 3 - pad; offset += 1) {
      bytes[out++] = decoded[offset]
    }
  }
  return bytes
}

/** Strips ASCII whitespace, decodes strictly, then checks length and SHA-256 against `header`. */
export function decodeNonTextVerified(base64Text: string, header: NonTextHeader): NonTextBody {
  const bytes = decodeStrictBase64(base64Text.replace(BASE64_WHITESPACE, ''))
  if (!bytes) {
    return { ok: false, error: 'base64' }
  }
  if (BigInt(bytes.length) !== header.size) {
    return { ok: false, error: 'size' }
  }
  if (sha256Hex(bytes) !== header.sha256) {
    return { ok: false, error: 'sha256' }
  }
  return { ok: true, bytes }
}

/** An un-escaped entry body: undefined when it is not a non-text entry, else its verified bytes or why not. */
export function parseNonTextBody(content: string): NonTextBody | undefined {
  const lineBreak = content.indexOf('\n')
  const first = lineBreak === -1 ? content : content.slice(0, lineBreak)
  const header = parseNonTextPlaceholderLine(first)
  return (
    header && decodeNonTextVerified(lineBreak === -1 ? '' : content.slice(lineBreak + 1), header)
  )
}
