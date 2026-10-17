import { describe, expect, it } from 'vitest'
import { svgPreviewText } from './clipcode-svg-text'

const base64 = (text: string) => btoa(String.fromCharCode(...new TextEncoder().encode(text)))

describe('svgPreviewText', () => {
  it('decodes an SVG preview back to its UTF-8 text', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><title>é</title></svg>\n'
    expect(
      svgPreviewText({ content: base64(svg), isBinary: true, mimeType: 'image/svg+xml' })
    ).toBe(svg)
  })

  it('leaves other binaries, text reads and invalid bytes alone', () => {
    expect(
      svgPreviewText({ content: 'JVBERi0=', isBinary: true, mimeType: 'application/pdf' })
    ).toBeNull()
    expect(svgPreviewText({ content: '<svg/>', isBinary: false })).toBeNull()
    expect(
      svgPreviewText({ content: btoa('\xff\xfe'), isBinary: true, mimeType: 'image/svg+xml' })
    ).toBeNull()
  })
})
