import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runProcess } from '@orca/process-host'
import { DARWIN_EXCLUDE, isSourceScan, selectSourceScanTests } from './fork-source-scan-tests.mjs'

const SCRIPT = join(import.meta.dirname, 'fork-source-scan-tests.mjs')
const SCAN = `import { readFileSync } from 'node:fs'\nreadFileSync('src/main/index.ts', 'utf8')\n`
const IMPORT_ONLY = `import { thing } from './thing'\nexpect(thing).toBe(1)\n`

let roots = []
afterEach(() => {
  for (const root of roots) {
    rmSync(root, { recursive: true, force: true })
  }
  roots = []
})

function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), 'fork-source-scan-'))
  roots.push(root)
  for (const [path, source] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), source)
  }
  return root
}

describe('isSourceScan', () => {
  it.each([
    ["readFileSync(join(__dirname, 'x.ts'))"],
    ["await readFile(new URL('./x.ts', import.meta.url))"],
    ["import { readdir } from 'node:fs/promises'\nreaddir(process.cwd())"],
    ["globSync('src/**/*.ts')"],
    ["readFileSync('resources/icon.svg')"],
    ["JSON.parse(readFileSync('package.json', 'utf8'))"]
  ])('selects %s', (source) => {
    expect(isSourceScan(source)).toBe(true)
  })

  it.each([
    [IMPORT_ONLY],
    ["readFileSync(join(tmp, 'state.json'))"],
    ["const root = join(__dirname, '..')"]
  ])('skips %s', (source) => {
    expect(isSourceScan(source)).toBe(false)
  })
})

describe('selectSourceScanTests', () => {
  it('selects source-reading tests across unit roots and skips import-only ones', () => {
    const root = fixture({
      'src/main/census.test.ts': SCAN,
      'src/main/plain.test.ts': IMPORT_ONLY,
      'config/scripts/workflow.test.mjs': SCAN,
      'tests/e2e/spec-census.unit.test.ts': SCAN,
      'docs/not-a-unit-root.test.ts': SCAN
    })
    expect(selectSourceScanTests({ root, platform: 'linux' })).toEqual([
      'config/scripts/workflow.test.mjs',
      'src/main/census.test.ts',
      'tests/e2e/spec-census.unit.test.ts'
    ])
  })

  it("honours upstream's UNIT_EXCLUDE", () => {
    const root = fixture({
      'src/main/daemon/node-pty-fd-leak.test.ts': SCAN,
      'src/main/browser/popup-origin-chrome.electron.test.ts': SCAN,
      'tests/e2e/cross-version-wire/release-checkout.unit.test.ts': SCAN,
      'src/main/kept.test.ts': SCAN
    })
    expect(selectSourceScanTests({ root, platform: 'linux' })).toEqual(['src/main/kept.test.ts'])
  })

  it('skips the macOS-only exclusions on darwin alone', () => {
    const excluded = Object.keys(DARWIN_EXCLUDE)[0]
    const root = fixture({ [excluded]: SCAN })
    expect(selectSourceScanTests({ root, platform: 'darwin' })).toEqual([])
    expect(selectSourceScanTests({ root, platform: 'linux' })).toEqual([excluded])
  })
})

describe('fork-source-scan-tests CLI', () => {
  it('fails instead of printing an empty list', async () => {
    const root = fixture({ 'src/main/plain.test.ts': IMPORT_ONLY })
    const result = await runProcess({ program: process.execPath, args: [SCRIPT], cwd: root })
    expect(result.code).toBe(1)
    expect(result.stdout).toBe('')
    expect(result.stderr).toContain('selected no tests')
  })

  it('prints the selected files, one per line', async () => {
    const root = fixture({ 'src/main/census.test.ts': SCAN })
    const result = await runProcess({ program: process.execPath, args: [SCRIPT], cwd: root })
    expect(result.code).toBe(0)
    expect(result.stdout).toBe('src/main/census.test.ts\n')
  })
})
