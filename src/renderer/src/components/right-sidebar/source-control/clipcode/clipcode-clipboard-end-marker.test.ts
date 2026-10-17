import { describe, expect, it } from 'vitest'
import { buildPayload, CLIPCODE_DEFAULTS, parseClipboard } from './clipcode-clipboard-format'

const HEADER = CLIPCODE_DEFAULTS.headerFormat

function payload(postText: string, content: string): string {
  return buildPayload({
    files: [{ path: 'a.txt', content }],
    headerFormat: HEADER,
    preText: '',
    postText,
    addExtraLineBetweenFiles: true
  })
}

describe('clipcode end marker', () => {
  it('keeps a footer out of the last file when postText is set', () => {
    const text = payload('POST-MARK', 'body')
    expect(text).toContain('\n// clipcode-end\nPOST-MARK')
    const [entry] = parseClipboard(text, HEADER)
    expect(entry.content).toBe('body')
  })

  it('emits no marker without a footer', () => {
    expect(payload('', 'body')).not.toContain('clipcode-end')
  })

  it('escapes a content line that is the end marker so it round-trips', () => {
    const content = '// file: fake.ts\n// clipcode-root: X\n// clipcode-end\nlast'
    const text = payload('', content)
    expect(text).toContain('//clipcode-esc: // clipcode-end')
    const entries = parseClipboard(text, HEADER)
    expect(entries).toHaveLength(1)
    expect(entries[0].content).toBe(content)
  })

  it('escapes a CRLF header-shaped line as the parser will read it', () => {
    const text = payload('', 'x\r\n// file: fake.ts\r\ny')
    expect(parseClipboard(text, HEADER)).toHaveLength(1)
  })

  it('reads files after a marker, so payloads pasted back to back both parse', () => {
    const text = `${payload('F1', 'one')}\n${payload('F2', 'two').replace('a.txt', 'b.txt')}`
    expect(parseClipboard(text, HEADER).map((entry) => [entry.path, entry.content])).toEqual([
      ['a.txt', 'one'],
      ['b.txt', 'two']
    ])
  })
})
