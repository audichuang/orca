import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon
} from 'lucide-react'
import { Toaster as Sonner, type ToasterProps } from 'sonner'
import { useAppStore } from '@/store'
import { TOAST_BOTTOM_CLEARANCE_VAR } from '@/lib/toast-bottom-clearance'

const TOAST_BOTTOM_OFFSET = `max(calc(2.5rem + env(safe-area-inset-bottom, 0px)), var(${TOAST_BOTTOM_CLEARANCE_VAR}, 0px))`

const Toaster = ({ ...props }: ToasterProps) => {
  const theme = useAppStore((s) => s.settings?.theme) || 'system'

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      position="bottom-right"
      // Why: Orca has persistent bottom chrome, so bottom-right toasts need
      // breathing room above the status bar instead of sitting on its edge.
      // mobileOffset keeps that clearance below Sonner's 600px breakpoint
      // (narrow/resized windows and the web client), which otherwise reverts
      // to Sonner's default 16px and lets toasts crowd the status bar again.
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
  )
}

export { Toaster }
