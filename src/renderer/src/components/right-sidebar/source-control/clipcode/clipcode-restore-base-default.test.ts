import { describe, expect, it } from 'vitest'
import { parseClipboard } from './clipcode-clipboard-format'
import { defaultAdjustRestorePaths } from './clipcode-restore-base-default'
import type { ClipcodeTargetState } from './clipcode-restore-plan'

const header = '// file: $FILE_PATH'

describe('defaultAdjustRestorePaths', () => {
  it('leaves Adjust paths off when the clipboard paths already land on existing files', () => {
    expect(
      defaultAdjustRestorePaths({
        rootPath: '/MultiProduct',
        entries: parseClipboard('// file: [MODIFIED] notes/todo.txt\nflat layout\n', header),
        suggestion: { base: { kind: 'add', prefix: 'notes' } },
        states: new Map<string, ClipcodeTargetState>([
          ['notes/todo.txt', 'file'],
          ['notes/notes/todo.txt', 'missing']
        ])
      })
    ).toBe(false)
  })

  it('turns Adjust paths on when the adjusted paths hit existing files', () => {
    expect(
      defaultAdjustRestorePaths({
        rootPath: '/MultiProduct',
        entries: parseClipboard('// file: [MODIFIED] src/a.ts\nx\n', header),
        suggestion: { base: { kind: 'add', prefix: 'WebApp' } },
        states: new Map<string, ClipcodeTargetState>([['WebApp/src/a.ts', 'file']])
      })
    ).toBe(true)
  })

  it('keeps Adjust paths on for all-new files, and off without a suggestion', () => {
    const entries = parseClipboard('// file: [NEW] src/new.ts\nx\n', header)
    expect(
      defaultAdjustRestorePaths({
        rootPath: '/f',
        entries,
        suggestion: { base: { kind: 'add', prefix: 'WebApp' } },
        states: new Map()
      })
    ).toBe(true)
    expect(
      defaultAdjustRestorePaths({
        rootPath: '/f',
        entries,
        suggestion: undefined,
        states: new Map()
      })
    ).toBe(false)
  })
})
