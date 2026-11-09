import { describe, expect, it } from 'vitest'
import { shortenPathToWidth } from './clipcode-path-shortening'

// One unit per code point, so a decomposed letter (e + U+0301) is two units wide.
const measure = (text: string): number => [...text].length

describe('shortenPathToWidth', () => {
  it('keeps a path that fits', () => {
    expect(shortenPathToWidth('img/logo.png', 12, measure)).toBe('img/logo.png')
  })

  it('shrinks a 150-character folder to its first segment before any of the file name', () => {
    const path = `d11long/${'abcdefghij'.repeat(14)}/more/name-alpha.png`
    expect(shortenPathToWidth(path, 40, measure)).toBe('d11long/abcdefghijabcdef…/name-alpha.png')
    expect(shortenPathToWidth(path, 24, measure)).toBe('d11long/…/name-alpha.png')
    expect(shortenPathToWidth(path, 20, measure)).toBe('d11long/…/nam…ha.png')
  })

  it('keeps names of 58 to 60 characters that share a prefix apart', () => {
    const stem = 'quarterly-revenue-report-comparison-chart-version-'
    const shown = ['alpha.png', 'beta.png', 'gamma.png', 'zeta-1.png'].map((end) =>
      shortenPathToWidth(`shots/${stem}${end}`, 30, measure)
    )
    expect(shown).toEqual([
      'shots/quarterly-…ion-alpha.png',
      'shots/quarterly-…sion-beta.png',
      'shots/quarterly-…ion-gamma.png',
      'shots/quarterly-…on-zeta-1.png'
    ])
  })

  it('cuts only between whole characters', () => {
    expect(shortenPathToWidth(`${'e\u0301'.repeat(6)}.png`, 10, measure)).toBe(
      'e\u0301…e\u0301.png'
    )
  })
})
