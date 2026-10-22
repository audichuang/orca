import React, { useRef, useState, useCallback } from 'react'
import type { editor } from 'monaco-editor'
import { Check } from 'lucide-react'
import { setupContextualCopy } from './setup-contextual-copy'
import { translate } from '@/i18n/i18n'

export function useContextualCopySetup() {
  const [copyToast, setCopyToast] = useState<{ left: number; top: number } | null>(null)
  const copyToastTimeoutRef = useRef<number | null>(null)

  const setupCopy = useCallback(
    (
      editorInstance: editor.IStandaloneCodeEditor,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      _monaco: any,
      filePath: string,
      propsRef: React.MutableRefObject<{
        relativePath: string
        language: string
        onSave?: (content: string) => void
      }>
    ) => {
      setupContextualCopy({
        editorInstance,
        filePath,
        setCopyToast,
        propsRef,
        copyToastTimeoutRef
      })
    },
    []
  )

  const toastNode = copyToast ? (
    <div
      className="pointer-events-none fixed z-50 flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background shadow-floating"
      style={{ left: copyToast.left, top: copyToast.top }}
    >
      <Check size={14} aria-hidden />
      {translate('auto.components.editor.useContextualCopySetup.059bfb0d94', 'Context copied')}
    </div>
  ) : null

  return { setupCopy, toastNode }
}
