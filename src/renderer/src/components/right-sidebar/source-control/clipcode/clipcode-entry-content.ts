// Fork-only: content rules every ClipCode copy shares (binary, non-UTF-8, size cap).
import { getUtf8ByteLength, measureUtf8ByteLength } from '../../../../../../shared/utf8-byte-limits'
import type { ChangeTypeLabel, PayloadFile } from './clipcode-clipboard-format'

export type ClipcodeReadContent = { text: string } | { skippedReason: string }

export type ClipcodeEntryVerdict =
  | { kind: 'file'; file: PayloadFile; sizeSkipped: boolean }
  | { kind: 'binary' }
  | { kind: 'unreadable' }

export function classifyClipcodeEntryContent(
  path: string,
  changeType: ChangeTypeLabel,
  content: ClipcodeReadContent,
  maxBytes: number
): ClipcodeEntryVerdict {
  if ('skippedReason' in content) {
    return {
      kind: 'file',
      file: { path, changeType, skippedReason: content.skippedReason },
      sizeSkipped: true
    }
  }
  if (content.text.includes('\0')) {
    return { kind: 'binary' }
  }
  // Why: U+FFFD is what a lenient decode leaves of non-UTF-8 bytes; restoring it would corrupt the file (ClipCode does the same).
  if (changeType !== 'DELETED' && content.text.includes('�')) {
    return { kind: 'unreadable' }
  }
  if (measureUtf8ByteLength(content.text, { stopAfterBytes: maxBytes }).exceededLimit) {
    return {
      kind: 'file',
      file: {
        path,
        changeType,
        skippedReason: `size exceeds limit (${getUtf8ByteLength(content.text)} bytes)`
      },
      sizeSkipped: true
    }
  }
  return { kind: 'file', file: { path, changeType, content: content.text }, sizeSkipped: false }
}
