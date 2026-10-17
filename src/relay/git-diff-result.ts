import * as path from 'node:path'
import { getLargeDiffRenderLimit } from '../shared/large-diff-render-limit'
import { PREVIEWABLE_MIME } from './git-handler-utils'

export function buildDiffResult(
  originalContent: string,
  modifiedContent: string,
  originalIsBinary: boolean,
  modifiedIsBinary: boolean,
  filePath?: string,
  skipRenderLimit = false
) {
  if (originalIsBinary || modifiedIsBinary) {
    const ext = filePath ? path.extname(filePath).toLowerCase() : ''
    const mimeType = PREVIEWABLE_MIME[ext]
    return {
      kind: 'binary' as const,
      originalContent,
      modifiedContent,
      originalIsBinary,
      modifiedIsBinary,
      ...(mimeType ? { isImage: true, mimeType } : {})
    }
  }

  // Why: copy-to-clipboard callers need full text; the render limit only spares the diff viewer.
  const largeDiffRenderLimit = skipRenderLimit
    ? null
    : getLargeDiffRenderLimit({ originalContent, modifiedContent })
  if (largeDiffRenderLimit?.limited) {
    return {
      kind: 'text' as const,
      originalContent: '',
      modifiedContent: '',
      originalIsBinary: false,
      modifiedIsBinary: false,
      largeDiffRenderLimit
    }
  }

  return {
    kind: 'text' as const,
    originalContent,
    modifiedContent,
    originalIsBinary: false,
    modifiedIsBinary: false
  }
}
