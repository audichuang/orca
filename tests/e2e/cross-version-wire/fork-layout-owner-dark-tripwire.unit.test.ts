// Red here means upstream shipped layout-owner (or accepts git-graph tabs): R3/R4 can now trigger, see FORK.md "Deferred to upstream phase F".
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { editorTabContent } from '../../../src/renderer/src/store/slices/editor/tabs/editor-tab-open-through-layout-owner'
import type { OpenFile } from '../../../src/renderer/src/store/slices/editor/types/open-file'
import {
  importReleaseCheckoutModule,
  materializeReleaseCheckout,
  releaseModuleExport,
  REPO_ROOT,
  resolveBaselineReleaseRef
} from './release-checkout'

const SUITE_TIMEOUT_MS = 180_000
const LAYOUT_INTENTS_CAPABILITY = 'layout.intents.v1'

type DarkBuildSwitches = {
  darkBuildDefines: (env?: Record<string, string>) => Record<string, string>
}
type Parser = {
  safeParse: (value: unknown) => {
    success: boolean
    data?: unknown
    error?: { issues: { path: (string | number)[] }[] }
  }
}

let tmp: string
let darkSwitches: DarkBuildSwitches
let releaseCapabilities: readonly string[]
let layoutApply: Parser

beforeAll(async () => {
  const ref = resolveBaselineReleaseRef()
  tmp = mkdtempSync(join(tmpdir(), 'fork-layout-owner-tripwire-'))
  // config/ is not part of the release checkout archive, so read the baseline's file from git.
  const source = execFileSync('git', ['show', `${ref}:config/dark-build-switches.cjs`], {
    cwd: REPO_ROOT,
    encoding: 'utf8'
  })
  const file = join(tmp, 'dark-build-switches.cjs')
  writeFileSync(file, source)
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the baseline module exports darkBuildDefines(env); a reshaped export fails the assertions below.
  darkSwitches = createRequire(import.meta.url)(file) as DarkBuildSwitches
  const checkout = await materializeReleaseCheckout(ref)
  const [protocol, params] = await Promise.all([
    importReleaseCheckoutModule(checkout, 'src/shared/protocol-version.ts'),
    importReleaseCheckoutModule(checkout, 'src/shared/rpc-contract/workspace-layout-params.ts')
  ])
  releaseCapabilities = releaseModuleExport<readonly string[]>(protocol, 'RUNTIME_CAPABILITIES')
  layoutApply = releaseModuleExport<Parser>(params, 'LayoutApplyParams')
}, SUITE_TIMEOUT_MS)

afterAll(() => {
  if (tmp) {
    rmSync(tmp, { recursive: true, force: true })
  }
})

function openFile(overrides: Partial<OpenFile>): OpenFile {
  return {
    id: 'file-1',
    filePath: '/work/inner',
    relativePath: 'inner',
    worktreeId: 'folder:abc',
    language: 'plaintext',
    isDirty: false,
    mode: 'edit',
    ...overrides
  }
}

function openEditorTab(contentType: string, content: ReturnType<typeof editorTabContent>) {
  return {
    command: {
      type: 'openEditorTab',
      workspace: 'folder:abc',
      tabId: 'tab-1',
      fileId: 'file-1',
      contentType,
      ...content
    }
  }
}

describe('upstream layout-owner is still dark (R3/R4 unreachable)', () => {
  it('the baseline release compiles ORCA_LAYOUT_OWNER as window', () => {
    expect(darkSwitches.darkBuildDefines({}).ORCA_LAYOUT_OWNER).toBe(JSON.stringify('window'))
    // Control: the check can tell a main build apart.
    expect(darkSwitches.darkBuildDefines({ ORCA_LAYOUT_OWNER: 'main' }).ORCA_LAYOUT_OWNER).not.toBe(
      JSON.stringify('window')
    )
  })

  it('the baseline release host does not advertise layout.intents.v1', () => {
    expect(releaseCapabilities).not.toContain(LAYOUT_INTENTS_CAPABILITY)
  })

  it('the baseline layout.apply rejects a fork Git Graph open', () => {
    const file = openFile({
      mode: 'git-graph',
      gitGraph: { repoWorktreeId: 'repo-2::/work/inner' }
    })
    const command = openEditorTab('git-graph', editorTabContent(file))
    expect(command.command.view).toBeDefined()
    const parsed = layoutApply.safeParse(command)
    expect(parsed.success).toBe(false)
    expect(parsed.error?.issues.some((issue) => issue.path.includes('contentType'))).toBe(true)
  })

  it('the baseline layout.apply drops gitWorktreeId from an editor file record', () => {
    const file = openFile({ gitWorktreeId: 'repo-2::/work/inner' })
    const content = editorTabContent(file)
    expect(content.file?.gitWorktreeId).toBe('repo-2::/work/inner')
    const parsed = layoutApply.safeParse(openEditorTab('editor', content))
    expect(parsed.success).toBe(true)
    expect(JSON.stringify(parsed.data)).not.toContain('gitWorktreeId')
  })
})
