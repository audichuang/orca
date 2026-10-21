import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon
} from 'lucide-react'
import type { SyntheticEvent } from 'react'
import { Toaster as Sonner, type ToasterProps } from 'sonner'
import { useAppStore } from '@/store'
import { TOAST_BOTTOM_CLEARANCE_VAR } from '@/lib/toast-bottom-clearance'

const TOAST_BOTTOM_OFFSET = `max(calc(2.5rem + env(safe-area-inset-bottom, 0px)), var(${TOAST_BOTTOM_CLEARANCE_VAR}, 0px))`

// Why: a short outcome reads best with its action beside it; the toaster's default wraps actions below.
export const INLINE_ACTION_CLASS_NAMES = {
  content: '!basis-0',
  actionButton: '!m-0 !self-center'
}

// Why: scope to real modals; Radix menus/selects also set body pointer-events:none.
function isModalOverlayOpen(element: Element): boolean {
  return (
    element.ownerDocument.body.querySelector(
      ":scope > [data-slot='dialog-overlay'], :scope > [data-slot='sheet-overlay']"
    ) !== null
  )
}

function blockModalToastInteraction(event: SyntheticEvent): void {
  const target = event.target
  if (
    target instanceof Element &&
    target.closest('[data-sonner-toast]') !== null &&
    target.closest('[data-close-button]') === null &&
    isModalOverlayOpen(target)
  ) {
    event.preventDefault()
    event.stopPropagation()
  }
}

const Toaster = ({ ...props }: ToasterProps) => {
  const theme = useAppStore((s) => s.settings?.theme) || 'system'

  return (
    <div
      onPointerDownCapture={(event) => {
        if (
          event.target instanceof Element &&
          event.target.closest('[data-close-button]') &&
          isModalOverlayOpen(event.target)
        ) {
          // Toast interactions must not reach the backdrop or move modal focus.
          event.preventDefault()
          event.stopPropagation()
        } else {
          blockModalToastInteraction(event)
        }
      }}
      onClickCapture={blockModalToastInteraction}
      onAuxClickCapture={blockModalToastInteraction}
      onContextMenuCapture={blockModalToastInteraction}
    >
      <Sonner
        theme={theme as ToasterProps['theme']}
        position="bottom-right"
        // Reserve status-bar clearance at both normal and sub-600px mobileOffset breakpoints.
        // Fork-only: max() lifts toasts above bottom chrome that registers a clearance (toast-bottom-clearance.ts).
        offset={{ bottom: TOAST_BOTTOM_OFFSET }}
        mobileOffset={{ bottom: TOAST_BOTTOM_OFFSET }}
        className="toaster group"
        icons={{
          success: <CircleCheckIcon className="size-4" />,
          info: <InfoIcon className="size-4" />,
          warning: <TriangleAlertIcon className="size-4" />,
          error: <OctagonXIcon className="size-4" />,
          loading: <Loader2Icon className="size-4 animate-spin" />
        }}
        style={
          {
            '--normal-bg': 'var(--popover)',
            '--normal-text': 'var(--popover-foreground)',
            '--normal-border': 'var(--border)',
            '--border-radius': 'var(--radius)',
            '--width': 'min(26rem, calc(100vw - 2rem))'
          } as React.CSSProperties
        }
        {...props}
      />
    </div>
  )
}

export { Toaster }
