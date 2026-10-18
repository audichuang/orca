# Maintaining this fork

Personal fork of Orca. Fork-only code lives in fork-owned files where possible; upstream files carry the smallest diff that wires it in. Read this before rebasing onto a new upstream release, before merging fork work into `develop`, and before adding fork tests.

## Merge gate

- `make fork-check` is the gate for every rebase and every merge into `develop`: `pnpm tc`, the upstream suites the fork edits (`FORK_TEST_DIRS`), every test the fork added or changed since `FORK_BASE`, and the changed-code quality gate. `make fork-check-full` adds `--changed` and the folder multi-repo e2e; run it before a release.
- On GitHub the gate is `.github/workflows/fork-pr.yml`'s "Fork PR checks passed" job: `make fork-check` (split into `fork-check-static` plus four `fork-check-tests` shards that run in parallel), cross-version wire compatibility (the fork client talks to upstream-release hosts), and the macOS arm64 `make build`. Upstream workflows stay unedited but disabled on the fork; run `make fork-ci-disable-upstream` after a rebase that adds new ones.
- `FORK_BASE` is the newest upstream `vX.Y.Z` tag. A clone without upstream tags resolves an ancient one; the target now refuses to run then. Fix with `git fetch <upstream-remote> --tags`.
- The target forces `LC_ALL=C`: upstream real-git tests match English git messages and fail under a translated locale.
- When the fork starts touching a new upstream area, add that directory to `FORK_TEST_DIRS`.
- Typecheck (`pnpm tc:web` / `tc:node`) before committing; tests alone pass with type errors.

## What non-UI tests must cover

Upstream changes break fork features silently when they are type-compatible: a refactor that rebuilds an options object, a non-strict zod schema dropping an unknown field, a component that stops rendering a slot. Each fork seam needs a test that turns red then:

- **Field forwarding**: a fork field on an upstream request or result needs one test per hop (IPC handler, web preload, renderer runtime client, RPC method + zod, provider). It is optional, so `tc` never notices it vanishing.
- **Contract tests stub only the outermost edge** (`window.api`, IPC, the git binary) and run real upstream code in between. A test that mocks the upstream neighbour only checks the fork's own logic.
- **Fake data must match the real producer.** A fake reader once invented `missingSides`, which upstream `getCommitDiff` never set; the copy treated missing files as empty while its tests stayed green. Pin the producer with its own real-git test.
- **Persistence**: every fork field written to disk gets a save → reload → restore round trip (`workspace-layout-git-owner-roundtrip.test.ts` is the pattern).
- **UI interaction**: component tests with the real store (`folder-multi-repo-panel.test.tsx`, `git-history-graph.component.test.tsx`).
- **Prove the test bites**: remove the fix or mutate the seam and watch it fail before trusting a green run.
- Keep a contract test inside one layer; a main test importing renderer code (or the reverse) breaks the tsconfig projects. Write one contract per side of the seam instead.

To measure coverage after a large rebase, run a mutation pass: list the seams, apply plausible upstream edits one at a time in a separate checkout, and record which tests go red.

What only UI rounds catch: main↔renderer event plumbing at runtime, state accumulated over a long session, real clipboard round trips with the ClipCode plugins, focus and hover behaviour. Keep that set small (agent launch cwd, session restore, external-change banner, Paste & Restore, ClipCode copy, accordion) instead of rerunning every case.

## Upstream-file conventions

- `max-lines` cannot be disabled. When fork wiring pushes an upstream file over, move fork code out first. If upstream code has to move, open the new file with a comment naming where it came from, so rebases port upstream edits to it.
- Keep fork additions to upstream components as typed slots (`GitHistoryPanelSlots`) rather than inline branches.
- A cast needs its `oxlint-disable-next-line … -- SAFETY:` comment on the line directly above the `as`, or the quality gate flags it.
- ClipCode format rules live in `src/renderer/src/components/right-sidebar/source-control/clipcode/AGENTS.md`.

## Running tests on another machine

Before handing tests to a remote checkout, sync it in the same command: the commit equals local `HEAD`, upstream tags are fetched, `pnpm install --frozen-lockfile` if the lockfile moved, and no previous run is still going. Under heavy load a few upstream timing tests fail; rerun those files alone before calling it a regression.
