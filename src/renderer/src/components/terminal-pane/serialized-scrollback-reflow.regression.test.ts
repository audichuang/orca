import { describe, expect, it } from 'vitest'
import { Terminal } from '@xterm/headless'
import { SerializeAddon } from '@xterm/addon-serialize'

const write = (term: Terminal, data: string): Promise<void> =>
  new Promise((resolve) => term.write(data, resolve))

// Head-row width and joined char count of the wide 'X' logical line.
function wideLogicalLine(term: Terminal): { headWidth: number; totalChars: number } {
  const buf = term.buffer.active
  let headWidth = -1
  let totalChars = 0
  let inWide = false
  for (let i = 0; i < buf.length; i++) {
    const line = buf.getLine(i)
    if (!line) {
      continue
    }
    const text = line.translateToString(true).replace(/\s+$/, '')
    if (!line.isWrapped && text.startsWith('XXXX')) {
      headWidth = text.length
      totalChars = text.length
      inWide = true
      continue
    }
    if (inWide && line.isWrapped) {
      totalChars += text.length
      continue
    }
    if (inWide && !line.isWrapped) {
      inWide = false
    }
  }
  return { headWidth, totalChars }
}

describe('serialized scrollback reflow (remote-reattach fix assumption)', () => {
  it('reflows wide scrollback losslessly on resize, but not the active cursor line', async () => {
    const longLine = 'X'.repeat(200)

    async function probe(trailingNewline: boolean): Promise<{
      before: { headWidth: number; totalChars: number }
      after: { headWidth: number; totalChars: number }
    }> {
      // Source emulator at the wide width (what the server keeps when no viewport is sent).
      const src = new Terminal({ cols: 120, rows: 24, scrollback: 5000, allowProposedApi: true })
      const ser = new SerializeAddon()
      src.loadAddon(ser)
      await write(src, longLine + (trailingNewline ? '\r\ndone' : ''))
      const snapshot = ser.serialize({ scrollback: 100 })

      // Replay into the unmeasured default-80 renderer xterm, then show-time resize.
      const dst = new Terminal({ cols: 80, rows: 24, scrollback: 5000, allowProposedApi: true })
      await write(dst, snapshot)
      const before = wideLogicalLine(dst)
      dst.resize(120, 24)
      return { before, after: wideLogicalLine(dst) }
    }

    // Active cursor line (no newline after it): xterm never reflows the cursor's own line.
    const active = await probe(false)
    expect(active.before.headWidth).toBe(80)
    expect(active.after.headWidth).toBe(80)

    // Scrollback line (>=1 line below it): reflows to full width on resize, lossless.
    const scrollback = await probe(true)
    expect(scrollback.before.headWidth).toBe(80)
    expect(scrollback.after.headWidth).toBe(120)
    expect(scrollback.after.totalChars).toBe(200) // no truncation on reflow
  })
})
