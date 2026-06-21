import React, { useCallback, useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'

type ForceRemoveConfirmDialogProps = {
  open: boolean
  groupName: string
  onOpenChange: (open: boolean) => void
  onConfirm: () => Promise<void> | void
}

/** Confirmation dialog shown when an online group-delete returns 'unreachable',
 * asking the user whether to proceed with local force-remove instead. */
export function ForceRemoveConfirmDialog({
  open,
  groupName,
  onOpenChange,
  onConfirm
}: ForceRemoveConfirmDialogProps): React.JSX.Element {
  const [confirming, setConfirming] = useState(false)
  const [wasOpen, setWasOpen] = useState(open)
  const mountedRef = useRef(true)

  const handleContentRef = useCallback((node: HTMLDivElement | null): void => {
    mountedRef.current = node !== null
  }, [])

  // Why: mirror the ProjectGroupDeleteDialog pattern — clear in-flight state
  // synchronously on open so the confirm button isn't disabled when the dialog
  // reopens after a previous cancel.
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open && confirming) {
      setConfirming(false)
    }
  }

  const handleConfirm = useCallback(async () => {
    if (confirming) {
      return
    }
    setConfirming(true)
    try {
      await onConfirm()
      if (mountedRef.current) {
        setConfirming(false)
        onOpenChange(false)
      }
    } catch (error) {
      console.error('Force-remove confirm failed:', error)
      if (mountedRef.current) {
        setConfirming(false)
      }
    }
  }, [confirming, onConfirm, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent ref={handleContentRef}>
        <DialogHeader>
          <DialogTitle>
            {translate(
              'auto.components.sidebar.ForceRemoveConfirmDialog.title',
              'Remote environment offline'
            )}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.sidebar.ForceRemoveConfirmDialog.desc',
              'The remote environment that owns "{{value0}}" is currently offline. Force-remove it locally? The deletion will be synced automatically when the environment reconnects.',
              { value0: groupName }
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={confirming}>
            {translate('auto.components.sidebar.ForceRemoveConfirmDialog.cancel', 'Cancel')}
          </Button>
          <Button variant="destructive" onClick={() => void handleConfirm()} disabled={confirming}>
            {confirming
              ? translate(
                  'auto.components.sidebar.ForceRemoveConfirmDialog.confirming',
                  'Removing…'
                )
              : translate(
                  'auto.components.sidebar.ForceRemoveConfirmDialog.confirm',
                  'Force Remove Locally'
                )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
