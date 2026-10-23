import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createRequire, isBuiltin } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

// Why the real binary: only Electron's patched `fs` reports a `*.asar` as a directory (new inode per call).
const requireFromTest = createRequire(import.meta.url)
const electronBinary: unknown = requireFromTest('electron')
const electronDist = join(dirname(requireFromTest.resolve('electron/package.json')), 'dist')
const FIXTURE_ASAR = [
  join(electronDist, 'Electron.app/Contents/Resources/default_app.asar'),
  join(electronDist, 'resources/default_app.asar')
].find((candidate) => existsSync(candidate))

const roots: string[] = []

afterAll(() => {
  for (const root of roots) {
    rmSync(root, { recursive: true, force: true })
  }
})

async function bundleHelper(outFile: string): Promise<void> {
  const { build } = await import('vite')
  const result = await build({
    root: process.cwd(),
    configFile: false,
    logLevel: 'error',
    build: {
      write: false,
      minify: false,
      ssr: true,
      rollupOptions: {
        input: 'src/main/asar-transparent-fs.ts',
        // Mirror the shipped main bundle: CJS, `original-fs` not externalized.
        output: { format: 'cjs' },
        external: (id: string) => isBuiltin(id) || id === 'electron' || id.startsWith('electron/')
      }
    }
  })
  const first = Array.isArray(result) ? result[0] : result
  const chunk = 'output' in first ? first.output[0] : undefined
  const code = chunk && 'code' in chunk ? chunk.code : undefined
  if (typeof code !== 'string') {
    throw new Error('bundle produced no code')
  }
  writeFileSync(outFile, code, 'utf8')
}

describe('asar-transparent-fs statSync under real Electron', () => {
  it.runIf(FIXTURE_ASAR)(
    'stats an asar as a stable physical file while plain fs sees a virtual directory',
    async () => {
      const root = mkdtempSync(join(tmpdir(), 'orca-asar-stat-'))
      roots.push(root)
      if (typeof electronBinary !== 'string' || !FIXTURE_ASAR) {
        throw new Error('electron binary or fixture missing')
      }
      const bundlePath = join(root, 'asar-transparent-fs.cjs')
      const resultPath = join(root, 'result.json')
      const driverPath = join(root, 'driver.cjs')
      await bundleHelper(bundlePath)
      writeFileSync(
        driverPath,
        [
          `const fs = require('node:fs')`,
          `const { statSync } = require(${JSON.stringify(bundlePath)})`,
          `const target = ${JSON.stringify(FIXTURE_ASAR)}`,
          `const a = statSync(target)`,
          `const b = statSync(target)`,
          `const plain = fs.statSync(target)`,
          `fs.writeFileSync(${JSON.stringify(resultPath)}, JSON.stringify({`,
          `  helperIsFile: a.isFile(), sameIno: a.ino === b.ino, plainIsDirectory: plain.isDirectory()`,
          `}))`
        ].join('\n'),
        'utf8'
      )

      const run = spawnSync(electronBinary, [driverPath], {
        encoding: 'utf8',
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
        timeout: 60_000
      })
      expect(run.status, run.stderr?.slice(-2000)).toBe(0)

      expect(JSON.parse(readFileSync(resultPath, 'utf8'))).toEqual({
        helperIsFile: true,
        sameIno: true,
        // Control: proves the shim exists, so the assertions above bite.
        plainIsDirectory: true
      })
      // Sanity: the physical file is a real file outside Electron.
      expect(statSync(FIXTURE_ASAR).isFile()).toBe(true)
    },
    120_000
  )
})
