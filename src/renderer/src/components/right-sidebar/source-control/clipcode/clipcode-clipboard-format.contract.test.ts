import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildGitPayload,
  buildPayload,
  parseClipboard,
  type BuildPayloadOptions
} from './clipcode-clipboard-format'
import { payloadStats } from './clipcode-payload-stats'

// Frozen cross-tool contract shared byte-identically with ClipCodeVSCode and the IntelliJ plugin.
// Regenerate with ClipCodeVSCode scripts/gen-contract-fixtures.cjs, then update every copy and SHA together.
const EXPECTED_FIXTURES_SHA = 'df317eb7b412d4bd71222d71d4cd64a1652fbcac2d82468ec417e4ce95ec2468'
const FIXTURES_PATH = path.join(__dirname, '__fixtures__', 'clipcode-clipboard-contract.json')

type Fixtures = {
  buildCases: {
    name: string
    kind: 'regular' | 'git'
    options: BuildPayloadOptions
    wire: string
  }[]
  parseCases: {
    name: string
    headerFormat: string
    input: string
    expected: { path: string; content: string; changeTypes: string[] }[]
  }[]
  tokenCases: {
    name: string
    text: string
    chars: number
    lines: number
    words: number
    tokens: number
  }[]
}

const rawFixtures = readFileSync(FIXTURES_PATH)
const fixtures: Fixtures = JSON.parse(rawFixtures.toString('utf8'))

describe('clipcode clipboard contract', () => {
  it('fixture bytes match the frozen SHA', () => {
    expect(createHash('sha256').update(rawFixtures).digest('hex')).toBe(EXPECTED_FIXTURES_SHA)
  })

  it.each(fixtures.buildCases)('build $kind: $name', (c) => {
    const built = c.kind === 'git' ? buildGitPayload(c.options) : buildPayload(c.options)
    expect(built).toBe(c.wire)
  })

  it.each(fixtures.parseCases)('parse: $name', (c) => {
    const parsed = parseClipboard(c.input, c.headerFormat).map((e) => ({
      path: e.path,
      content: e.content,
      changeTypes: [...e.changeTypes].sort()
    }))
    expect(parsed).toEqual(c.expected)
  })

  it.each(fixtures.tokenCases)('stats: $name', (c) => {
    expect(payloadStats(c.text)).toEqual({
      chars: c.chars,
      lines: c.lines,
      words: c.words,
      tokens: c.tokens
    })
  })
})
