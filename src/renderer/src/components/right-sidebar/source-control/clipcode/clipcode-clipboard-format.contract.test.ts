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
import { parseNonTextBody } from './clipcode-non-text-body'
import { payloadStats } from './clipcode-payload-stats'

// Frozen cross-tool contract shared byte-identically with ClipCodeVSCode and the IntelliJ plugin.
// Regenerate with ClipCodeVSCode scripts/gen-contract-fixtures.cjs, then update every copy and SHA together.
const EXPECTED_FIXTURES_SHA = 'ca6da6eb43d66a7cf2932d9246d09540e0541abdbc4dfd6f155f3fbb25ce3d5f'
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
  nonTextBuildCases: {
    name: string
    headerFormat: string
    files: { path: string; base64?: string; content?: string }[]
    wire: string
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

  it.each(fixtures.nonTextBuildCases)('build non-text: $name', (c) => {
    const built = buildPayload({
      headerFormat: c.headerFormat,
      preText: '',
      postText: '',
      addExtraLineBetweenFiles: true,
      files: c.files.map((f) =>
        f.base64 === undefined
          ? { path: f.path, content: f.content }
          : { path: f.path, bytes: new Uint8Array(Buffer.from(f.base64, 'base64')) }
      )
    })
    expect(built).toBe(c.wire)
  })

  it.each(fixtures.nonTextBuildCases)('parse non-text: $name', (c) => {
    const entries = parseClipboard(c.wire, c.headerFormat)
    expect(entries.map((e) => e.path)).toEqual(c.files.map((f) => f.path))
    c.files.forEach((f, i) => {
      const entry = entries[i]
      if (f.base64 === undefined) {
        expect(entry.content).toBe(f.content)
        // T2's planner decodes an entry only when it is not an escaped placeholder.
        expect(entry.escapedPlaceholder || parseNonTextBody(entry.content) === undefined).toBe(true)
        return
      }
      expect(entry.escapedPlaceholder).toBe(false)
      const body = parseNonTextBody(entry.content)
      expect(body?.ok && Buffer.from(body.bytes).toString('base64')).toBe(f.base64)
    })
  })

  // Spec case 18: same strictness as OpenIDEA's Rust base64 STANDARD.
  it.each([
    ['AAE=', true],
    [' AA\r\nE=\t', true],
    ['AAE', false],
    ['AAF=', false],
    ['AA=E', false],
    ['AA-E', false],
    ['AA\vE=', false]
  ])('non-text Base64 %j decodes: %s', (base64, ok) => {
    const placeholder =
      '// File skipped: non-text file, 2 bytes, sha256 b413f47d13ee2fe6c845b2ee141af81de858df4ec549a58b7970bb96645bc8d2; base64 follows'
    expect(parseNonTextBody(`${placeholder}\n${base64}`)).toEqual(
      ok ? { ok: true, bytes: new Uint8Array([0, 1]) } : { ok: false, error: 'base64' }
    )
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
