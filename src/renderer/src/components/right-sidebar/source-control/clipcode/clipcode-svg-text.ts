const SVG_MIME_TYPE = 'image/svg+xml'

/**
 * File reads hand SVGs back as a base64 preview because they render as images, but SVG is text
 * and ClipCode copies it. Returns the decoded text, or null when it is not valid UTF-8 text.
 */
export function svgPreviewText(file: {
  content: string
  isBinary: boolean
  mimeType?: string
}): string | null {
  if (!file.isBinary || file.mimeType !== SVG_MIME_TYPE) {
    return null
  }
  try {
    const bytes = Uint8Array.from(atob(file.content), (char) => char.charCodeAt(0))
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return text.includes('\0') ? null : text
  } catch {
    return null
  }
}
