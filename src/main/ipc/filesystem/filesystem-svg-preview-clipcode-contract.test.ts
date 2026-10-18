import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { readLocalFileContent } from './filesystem-file-content-inspection'

// Fork contract: ClipCode's svgPreviewText (renderer clipcode-svg-text.ts) decodes an SVG image
// preview only when the mime is exactly image/svg+xml and the content is base64 of the source.
describe('SVG read shape that ClipCode copy relies on', () => {
  it('returns the source as text, or as an exact-mime base64 preview of it', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'clipcode-svg-'))
    const file = path.join(dir, 'icon.svg')
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><title>中文</title></svg>\n'
    await writeFile(file, svg)
    const read = await readLocalFileContent(file)
    if (!read.isBinary) {
      expect(read.content).toBe(svg)
      return
    }
    expect(read.mimeType).toBe('image/svg+xml')
    expect(Buffer.from(read.content, 'base64').toString('utf8')).toBe(svg)
  })
})
