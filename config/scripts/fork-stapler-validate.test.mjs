import { spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const script = join(import.meta.dirname, 'fork-stapler-validate.sh')
const dirs = []

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

// A fake xcrun that exits with the next code from `codes` on each call and logs its arguments.
function runWithXcrunExits(codes) {
  const dir = mkdtempSync(join(tmpdir(), 'fork-stapler-'))
  dirs.push(dir)
  writeFileSync(join(dir, 'codes'), `${codes.join('\n')}\n`)
  writeFileSync(
    join(dir, 'xcrun'),
    `#!/usr/bin/env bash\necho "$*" >> "${dir}/calls"\ncode=$(head -n 1 "${dir}/codes")\nsed -i.bak 1d "${dir}/codes"\nexit "$code"\n`
  )
  chmodSync(join(dir, 'xcrun'), 0o755)
  const result = spawnSync('bash', [script, 'dist/Orca.app'], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, STAPLER_VALIDATE_DELAY_SECONDS: '0' }
  })
  const calls = readFileSync(join(dir, 'calls'), 'utf8').trim().split('\n')
  return { status: result.status, calls }
}

describe('fork-stapler-validate', () => {
  it('retries an unreachable CloudKit (exit 68) and passes once it answers', () => {
    const { status, calls } = runWithXcrunExits([68, 68, 0])
    expect(status).toBe(0)
    expect(calls).toEqual(Array(3).fill('stapler validate dist/Orca.app'))
  })

  it('gives up with exit 68 after three unreachable attempts', () => {
    const { status, calls } = runWithXcrunExits([68, 68, 68, 0])
    expect(status).toBe(68)
    expect(calls).toHaveLength(3)
  })

  it('fails at once on any other error, such as a missing ticket', () => {
    const { status, calls } = runWithXcrunExits([65, 0])
    expect(status).toBe(65)
    expect(calls).toHaveLength(1)
  })
})
