// @vitest-environment happy-dom
// Fork seam guard: the bulk bar keeps ClipCode's Copy Full Source and disables it while a bulk action runs.
import '@testing-library/jest-dom/vitest'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import {
  ClipcodeSourceControlActionsContext,
  type ClipcodeSourceControlActions
} from '../clipcode/clipcode-actions-context'
import { BulkActionBar } from './bulk-action-bar'

afterEach(cleanup)

const actions: ClipcodeSourceControlActions = {
  copyRowFullSource: vi.fn(),
  copySelectionFullSource: vi.fn(),
  copySectionFullSource: vi.fn(),
  isStatusTruncated: false
}

function renderBar(isExecuting: boolean): void {
  render(
    <TooltipProvider>
      <ClipcodeSourceControlActionsContext.Provider value={actions}>
        <BulkActionBar
          selectedCount={2}
          stageableCount={2}
          unstageableCount={0}
          onStage={vi.fn()}
          onUnstage={vi.fn()}
          onClear={vi.fn()}
          isExecuting={isExecuting}
        />
      </ClipcodeSourceControlActionsContext.Provider>
    </TooltipProvider>
  )
}

describe('bulk action bar ClipCode Copy Full Source', () => {
  it('copies the selection when idle', () => {
    renderBar(false)
    fireEvent.click(screen.getByRole('button', { name: 'Copy Full Source' }))
    expect(actions.copySelectionFullSource).toHaveBeenCalledTimes(1)
  })

  it('is disabled while a bulk action runs', () => {
    renderBar(true)
    expect(screen.getByRole('button', { name: 'Copy Full Source' })).toBeDisabled()
  })
})
