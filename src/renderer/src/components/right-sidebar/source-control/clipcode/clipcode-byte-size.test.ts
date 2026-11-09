import { describe, expect, it } from 'vitest'
import { formatClipcodeBytes } from './clipcode-byte-size'

describe('formatClipcodeBytes', () => {
  it('spells bytes under 1024 as B, then one decimal below 10 and none above', () => {
    expect(
      [0, 83, 1023, 1024, 4096, 10_240, 12_288, 1_572_864, 2_097_152, 52_428_800].map(
        formatClipcodeBytes
      )
    ).toEqual([
      '0 B',
      '83 B',
      '1023 B',
      '1.0 KB',
      '4.0 KB',
      '10 KB',
      '12 KB',
      '1.5 MB',
      '2.0 MB',
      '50 MB'
    ])
  })

  it('re-picks the precision and unit after rounding reaches the next step', () => {
    expect([10_239, 10_180, 1_048_575, 1_048_063].map(formatClipcodeBytes)).toEqual([
      '10 KB',
      '9.9 KB',
      '1.0 MB',
      '1023 KB'
    ])
  })
})
