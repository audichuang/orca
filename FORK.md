# Maintaining this fork

Personal fork of Orca. Fork-only code lives in fork-owned files where possible; upstream files carry the smallest diff that wires it in. Read this before rebasing onto a new upstream release, before merging fork work into `develop`, and before adding fork tests.

## Merge gate

- Fork CI (below) is the merge gate for every rebase and every merge into `develop`; it runs upstream's full unit suite (`FORK_TESTS=all`), like upstream's own PR CI. Locally, `make fork-check` is the fast pre-check: `pnpm tc`, `vitest --changed $(FORK_BASE)`, the changed-code quality gate and `fork-check-lint`.
- Local `--changed` does not run the tests that read source as text instead of importing it; only CI's full suite does.
- `make fork-check-e2e` runs the folder multi-repo e2e plus every e2e spec the fork added or changed since `FORK_BASE`, all in the `electron-headless` project, so a fork test tagged `@headful` never runs there.
- `make fork-check-full` is `fork-check` plus `fork-check-e2e`, `fork-check-wire` (cross-version journeys) and `fork-check-mobile` (mobile web app checks; needs Google Chrome): every fork CI job but the full unit suite and the macOS build, run by the same targets CI calls. Run it before pushing; CI is the gate, not the place to find out. It runs every step even after one fails and names the failed ones at the end. On macOS `fork-check-tests` also fails upstream's own tests (`orca-runtime.test.ts` compares `/var` with `/private/var`), which pass on CI's Linux; judge a local failure against the files the change touched. Two `fork-check-wire` runs at once contend for the shared release-cache lock; give the second `ORCA_DISABLE_SHARED_RELEASE_CACHE=1`.
- On GitHub the gate is `.github/workflows/fork-pr.yml`'s "Fork PR checks passed" job: `fork-check-static`, full-suite `fork-check-tests` shards, `fork-check-e2e` under Xvfb, `fork-check-wire` (the fork client talks to upstream-release hosts), `fork-check-mobile`, and the macOS arm64 `make build`. Upstream workflows stay unedited but disabled on the fork; run `make fork-ci-disable-upstream` after a rebase that adds new ones.
- `config/scripts/fork-pr-gate-needs.mjs` (in `fork-check-lint`) fails when `verify` could pass without every other `fork-pr.yml` job succeeding.
- `FORK_BASE` is the newest upstream `vX.Y.Z` tag. A clone without upstream tags resolves an ancient one; the target now refuses to run then, and when no tag resolves at all. Fix with `git fetch <upstream-remote> --tags`.
- The target forces `LC_ALL=C`: upstream real-git tests match English git messages and fail under a translated locale.
- `fork-check-lint` runs upstream's `pnpm lint` steps from `package.json` via `config/scripts/fork-lint-run.mjs`, minus its `EXCLUDED`, which fails once upstream drops an excluded step.
- A fork file that an upstream census or ratchet must list (`config/*-baseline.txt`, `src/shared/wsl-move/*-dispositions.ts`) gets its own entry there; on a rebase conflict in those files keep both sides.
- Keep `git config rerere.enabled true` so a conflict resolved once replays on the next rebase.
- Rebase with `git rebase --onto vNEW vOLD`: upstream release tags are side commits (`release: vX.Y.Z` on a branch), so the old tag is not an ancestor of the new one and a plain `git rebase vNEW` replays the old release commit into a `package.json` conflict.
- Locale files (`src/renderer/src/i18n/locales/*`) that conflict: keep both sides, since fork keys are pure additions. Don't take upstream's side and regenerate: `sync:localization-catalog` re-adds only English, so the fork's translations in the other five locales would be lost. Then run `pnpm run verify:localization-catalogs`.
- Typecheck (`pnpm tc:web` / `tc:node`) before committing; tests alone pass with type errors.
- `typecheck:e2e` is not in the gate: upstream's own `tests/tools` fixtures fail it at the release tag.

## Release

- `main` is a pointer, never a merge target: develop is rebased on every upstream release, so main only follows by force-push. Move it yourself when a develop commit is worth installing.
- The commit: the merge commit of a feat → `develop` PR whose "Fork PR checks passed" ran with `develop` at its current head, merged with the merge-commit method (squash and rebase create a sha no run tested). After a rebase of `develop` that skipped a PR, it must pass `make fork-check-full` first.
- From the dev clone (remote `fork`): move `main` and push an **annotated** tag (N counts up per upstream X.Y.Z); its message becomes the release notes (Chinese, user-visible changes since the last release):

  ```sh
  old=$(git ls-remote fork refs/heads/main | cut -f1)
  git tag -a vX.Y.Z-fork.N <sha> -F notes.md && git push --atomic --force-with-lease=main:$old fork <sha>:main vX.Y.Z-fork.N
  ```

- The tag push runs `.github/workflows/fork-release.yml` on a macOS arm64 runner: it refuses a tag that is not fork `main`, builds `make fork-dmg`, publishes the GitHub Release with the dmg and its SHA-256, and bumps `audichuang/homebrew-tap`'s `Casks/orca-fork.rb`. Secrets: `FORK_SIGNING_P12` (base64) and `FORK_SIGNING_P12_PASSWORD` from 1Password (Agent vault, "Orca Fork Code Signing (p12)" / "(p12 password)"), `HOMEBREW_TAP_TOKEN` (fine-grained PAT, Contents write on the tap). Re-running the workflow on the same tag replaces the dmg and notes.
- Releases build on hosted `macos-15`. The repo variable `FORK_RELEASE_RUNNER` can name a self-hosted runner label instead; one was tried on the macmini (about 1.5 min faster) and dropped: it needs the login keychain unlocked (LaunchAgent without `SessionCreate`, a logged-in user) and exposes that keychain to jobs from a public repo.
- To test a workflow change without releasing, push an annotated `fork-release-dryrun-<anything>` tag (`fork-release-dryrun-hosted-<anything>` forces the hosted runner): it builds and signs, prints the release notes, uploads the dmg as an artifact, and skips the release and the tap. Delete the tag afterwards.
- `make fork-dmg FORK_VERSION=X.Y.Z-fork.N` still builds locally (the identity must be in the keychain) when CI is unavailable. The fork builder config excludes untracked checkout entries, and the build fails if app.asar still ships one: local dmgs once leaked `.orca/drops` screenshots and `CLAUDE.local.md`.
- Pushed tags and `backup/*` branches keep released commits reachable; don't protect `main`, or allow force pushes if you do.
- Install side: `make sync && make update`, never `git pull`, which merges the old and new histories. `sync` refuses on tracked changes, on local `main` commits the fork never had, and on ignored files the new commit would overwrite (`make clean` clears `dist/` and `out/`).

## When a fork e2e goes red

- On CI, download the job's artifact (`gh run download <run> -R audichuang/orca -n fork-e2e-playwright-traces`) and open `shots/`: the folder spec saves a screenshot per step, and the step before `FAIL-<scenario>.png` shows what the page looked like. `test-failed-1.png` is taken after the run and the Electron trace has no frames.
- Something covering the target (a toast, a dialog, a floating button) is a product bug until shown otherwise: a user hits it too. Fix the layout and make a geometry check go red on the old code. Wait for an overlay to leave only when it would make the scenario's own check pass early (S13), never to get a click through.
- Locally, `fork-check-e2e` and `fork-check-wire` first wait up to 10 minutes for the 1-minute load to fall to the core count; a timeout on a still-loaded machine is load first, so rerun it quiet before calling it a regression.

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

Before handing tests to a remote checkout, sync it in the same command: the commit equals local `HEAD`, upstream tags are fetched, `pnpm install --frozen-lockfile` if the lockfile moved, and no previous run is still going. A test that passes alone but fails in a loaded run is not proven flaky or pre-existing: run the same shard at `FORK_BASE` before excluding it. Files run isolated, so the usual cause is real timers an earlier test in the same file never stopped, not another file's state.
