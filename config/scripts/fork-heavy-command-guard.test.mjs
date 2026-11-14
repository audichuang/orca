import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { findHeavyCommands } from './fork-heavy-command-guard.mjs'

describe('findHeavyCommands', () => {
  it.each([
    ['pnpm tc'],
    ['pnpm run tc:node'],
    ['pnpm lint'],
    ['pnpm check:changed'],
    ['pnpm run check:code-quality:changed v1.4.258'],
    ['pnpm test'],
    ['make fork-check'],
    ['make -k fork-check-static'],
    ['LC_ALL=C make fork-check-full'],
    ['cd /tmp/x && make fork-canary > out.log 2>&1; echo $? > out.log.exit'],
    ['pnpm exec vitest run --config config/vitest.config.ts a.test.ts b.test.ts'],
    ['pnpm exec vitest run --config config/vitest.config.ts'],
    ['env LC_ALL=C pnpm exec vitest run --config config/vitest.config.ts $files'],
    ['node config/scripts/fork-hunk-guard-scan.mjs v1.4.258 --out out/scan'],
    ['node config/scripts/fork-upstream-red.mjs v1.4.258 ../base out/red'],
    ['pnpm exec vitest run src/shared'],
    ['pnpm exec vitest run --config config/vitest.config.ts "src/**/*.test.ts"'],
    ['pnpm test src/main'],
    ['make -C . fork-check'],
    ['make -j 4 build fork-check-static'],
    ['pnpm --dir . tc'],
    ['pnpm -C . run lint']
  ])('blocks %s', (command) => {
    expect(findHeavyCommands(command)).not.toEqual([])
  })

  it.each([
    ["bash config/scripts/fork-remote.sh 'make -k fork-check-static'"],
    ['bash config/scripts/fork-remote.sh make fork-check'],
    ["orca-remote 'pnpm tc'"],
    ['cd "$K" && bash "$MAIN/config/scripts/fork-remote.sh" pnpm tc > "$S/tc-1.log" 2>&1'],
    ['FORK_LOCAL_HEAVY=1 make fork-check-static'],
    [
      'pnpm install --frozen-lockfile && FORK_LOCAL_HEAVY=1 CANARY_KEEP=1 make fork-canary > x 2>&1'
    ],
    ['CANARY_REF=abc CANARY_MERGE_ONLY=1 CANARY_OUT="$S/m" make fork-canary > "$S/merge.out" 2>&1'],
    ['pnpm exec vitest run --config config/vitest.config.ts src/a.test.ts'],
    ['pnpm test config/scripts/fork-heavy-command-guard.test.mjs --maxWorkers=2'],
    ['pnpm test "config/scripts/fork-heavy-command-guard.test.mjs" --maxWorkers=2'],
    ['pnpm exec vitest run --config config/vitest.config.ts src/a.test.ts > /tmp/one.log 2>&1'],
    ['make -n fork-check'],
    ['node config/scripts/fork-hunk-guard-scan.mjs --report out/scan'],
    ['grep -n "pnpm tc" FORK.md'],
    ["git commit -m 'run make fork-check on ubuntu'"],
    ["cat > /tmp/x.sh <<'EOF'\npnpm tc\nmake fork-check\nEOF"],
    ['make build'],
    ['npx playwright test tests/e2e/a.spec.ts --project=electron-headless']
  ])('allows %s', (command) => {
    expect(findHeavyCommands(command)).toEqual([])
  })

  // A hook that blocks a pipeline's own commands stops the unattended canary or auto-rebase without a sound.
  it.each([
    '.claude/skills/orca-fork-canary/SKILL.md',
    '.claude/skills/orca-fork-auto-rebase/SKILL.md'
  ])('allows every shell snippet in %s', (file) => {
    const blocks = [...readFileSync(file, 'utf8').matchAll(/```sh\n([\s\S]*?)```/g)].map(
      (m) => m[1]
    )
    expect(blocks.length).toBeGreaterThan(0)
    for (const block of blocks) {
      expect([block, findHeavyCommands(block)]).toEqual([block, []])
    }
  })
})
