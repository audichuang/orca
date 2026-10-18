// Fork seam guard: nothing renders SourceControlPanelContent in tests, so pin that it still plugs the
// fork's Commits toolbar / load-more / no-match message into upstream's GitHistoryPanel slots.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(join(__dirname, 'panel-content.tsx'), 'utf8')
const panel = source.slice(source.indexOf('<GitHistoryPanel'))

describe('panel-content wires the fork Commits slots', () => {
  it.each([
    ['toolbar', '<GitHistoryGraphToolbar'],
    ['footer', '<GitHistoryGraphLoadMore'],
    ['emptyMessage', '<GitHistoryGraphEmptyMessage']
  ])('%s={%s …}', (slot, element) => {
    expect(panel).toMatch(new RegExp(`${slot}=\\{\\s*${element}\\b`))
  })
})
