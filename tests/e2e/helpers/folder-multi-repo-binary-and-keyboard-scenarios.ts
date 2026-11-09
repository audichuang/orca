import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { expect } from './orca-app'
import {
  expectedPayload,
  git,
  gitRaw,
  isBinary,
  readStatus,
  statsLine
} from './folder-multi-repo-expectations'
import {
  clearSourceControlSelections,
  type ExtraScenarioContext
} from './folder-multi-repo-scenario-context'

// S17, S19: binary-to-text copy and multi-select context-menu copy.
export async function runBinaryAndKeyboardScenarios(ctx: ExtraScenarioContext): Promise<void> {
  const {
    page,
    R,
    refreshBtn,
    H,
    scenario,
    shot,
    entry,
    expandOnly,
    setClipboard,
    copiedPayload,
    compare
  } = ctx
  await scenario('S17 Binary to text change copies the index text', async (ev) => {
    const rel = 'bin.dat'
    writeFileSync(path.join(R.docs, rel), Buffer.from([0x89, 0x00, 0x01, 0x02, 0x00, 0xff]))
    git(R.docs, 'add', rel)
    git(R.docs, 'commit', '-qm', 'add binary')
    writeFileSync(path.join(R.docs, rel), 'now plain text\nsecond line\n')
    git(R.docs, 'add', rel)
    expect(readStatus(R.docs)).toEqual([{ area: 'staged', code: 'M', path: rel }])
    expect(isBinary(gitRaw(R.docs, 'show', `HEAD:${rel}`))).toBe(true)
    await refreshBtn.click()
    await expandOnly(H.docs)
    await expect(entry('staged', rel)).toHaveCount(1, { timeout: 20_000 })
    await setClipboard(page, 'sentinel')
    await entry('staged', rel).click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Copy Full Source' }).click()
    const { actual } = await copiedPayload()
    const expected = expectedPayload({
      rootName: 'MultiProduct',
      files: [
        { repoDir: 'docs-site', repoAbs: R.docs, entry: { area: 'staged', code: 'M', path: rel } }
      ],
      forceIndexForStaged: true
    })
    compare(ev, 'S17-binary-to-text', actual, expected)
    expect(actual).toContain('// file: [MODIFIED] docs-site/bin.dat')
    expect(actual).toContain('now plain text')
    await shot('S17-binary-to-text')
  })

  await scenario('S19 Context menu on a multi-selection copies every selected file', async (ev) => {
    await expandOnly(H.web)
    await clearSourceControlSelections(page)
    const rows = [
      { area: 'unstaged', p: 'src/partial.ts' },
      { area: 'unstaged', p: 'src/deleted-unstaged.ts' }
    ]
    await setClipboard(page, 'sentinel')
    await entry(rows[0]!.area, rows[0]!.p).click({ modifiers: ['ControlOrMeta'] })
    await entry(rows[1]!.area, rows[1]!.p).click({ modifiers: ['ControlOrMeta'] })
    // Right-click a row that is already part of the selection.
    await entry(rows[1]!.area, rows[1]!.p).click({ button: 'right' })
    await expect(page.getByRole('menuitem', { name: 'Copy Full Source' })).toBeVisible()
    await shot('S19-multi-context-menu')
    await page.getByRole('menuitem', { name: 'Copy Full Source' }).click()
    const { actual, toast } = await copiedPayload()
    const st = readStatus(R.webapp)
    const files = rows.map((r) => ({
      repoDir: 'WebApp',
      repoAbs: R.webapp,
      entry: st.find((x) => x.area === r.area && x.path === r.p)!
    }))
    const fwd = expectedPayload({ rootName: 'MultiProduct', files, forceIndexForStaged: true })
    const rev = expectedPayload({
      rootName: 'MultiProduct',
      files: files.toReversed(),
      forceIndexForStaged: true
    })
    compare(ev, 'S19-multi-context', actual, actual === rev ? rev : fwd)
    expect(toast).toContain(statsLine(actual))
    // Selection outlives the menu; later scenarios assume none.
    await clearSourceControlSelections(page)
  })
}
