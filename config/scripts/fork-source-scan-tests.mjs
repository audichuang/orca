// Fork-only: prints the src tests that read source files as text (census and grep-style guards).
// `vitest --changed` follows imports, so it never selects them, yet a fork file can turn them red.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const READS_FILES = /\b(?:readFileSync|readdirSync)\b/
const FROM_THE_TREE = /__dirname|import\.meta\.(?:url|dirname)|process\.cwd\(\)/

function testFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      return entry.name === 'node_modules' ? [] : testFiles(path)
    }
    return /\.test\.tsx?$/.test(entry.name) ? [path] : []
  })
}

const scans = testFiles('src').filter((path) => {
  const source = readFileSync(path, 'utf8')
  return READS_FILES.test(source) && FROM_THE_TREE.test(source)
})
process.stdout.write(`${scans.sort().join('\n')}\n`)
