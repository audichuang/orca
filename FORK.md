# Maintaining this fork

Personal fork of Orca. Fork-only code lives in fork-owned files where possible; upstream files carry the smallest diff that wires it in. Read this before rebasing onto a new upstream release, before merging fork work into `develop`, and before adding fork tests.

## Red lines

- Push only to the fork remote (`audichuang/orca`), never to upstream (`stablyai/orca`).
- The base is the newest upstream release tag, not upstream `main`.
- Work goes on a branch with a PR into `develop`, merged once Fork CI is green; never push `develop` directly, except a rebase and doc-only changes.
- A doc-only change (Markdown outside `.claude/skills/`, such as FORK.md, AGENTS.md or `docs/`) may be pushed straight to `develop` as a fast-forward, while no `rebase/*` branch exists on the fork (an auto-rebase in flight would lose its lease). The pipeline skills in `.claude/skills/` still go through a PR: they decide unattended moves of `develop` and releases, so Fork CI and review stay in front of them.
- `fork-canary-notes` is the exception to PRs: an orphan branch holding the pipelines' shared state (`known-resolutions.md`, `canary-last.json`), no CI, never rebased, written only by `config/scripts/fork-notes.sh`, which never forces.
- Pick a branch prefix that is not itself a branch on the fork: the fork carries a `refactor` branch, so pushing `refactor/<x>` is rejected as a directory/file conflict.
- A PR meant for upstream branches from upstream `main` and carries no fork-only file (`Makefile`, fork CI, `FORK.md`).

## Merge gate

- Fork CI (below) is the merge gate for every rebase and every merge into `develop`; it runs upstream's full unit suite (`FORK_TESTS=all`), like upstream's own PR CI. Locally, `make fork-check` is the fast pre-check: `pnpm tc`, `vitest --changed $(FORK_BASE)`, the changed-code quality gate and `fork-check-lint`.
- Run the quality gate alone as `pnpm run check:code-quality:changed <tag>`, where `<tag>` is the `>> fork base:` line `make fork-check` prints (`git describe --tags --abbrev=0 --match 'v[0-9]*' --exclude '*fork*' HEAD`).
- Local `--changed` does not run the tests that read source as text instead of importing it; only CI's full suite does.
- `make fork-check-e2e` runs the folder multi-repo e2e plus every e2e spec the fork added or changed since `FORK_BASE`, all in the `electron-headless` project, so a fork test tagged `@headful` never runs there.
- `make fork-check-full` is `fork-check` plus `fork-check-e2e`, `fork-check-wire` (cross-version journeys) and `fork-check-mobile` (mobile web app checks; needs Google Chrome): every fork CI job but the full unit suite and the macOS build, run by the same targets CI calls. Run it before pushing a code change (doc-only changes skip it); CI is the gate, not the place to find out. Run it in a detached worktree pinned at the commit under test (`git worktree add --detach <dir> <sha>`, then `pnpm install --frozen-lockfile` there) and keep editing elsewhere: an edit landing mid-run leaves a result that matches no commit. It runs every step even after one fails and names the failed ones at the end. On macOS `fork-check-tests` also fails upstream's own tests (`orca-runtime.test.ts` compares `/var` with `/private/var`), which pass on CI's Linux; judge a local failure against the files the change touched. Two `fork-check-wire` runs at once contend for the shared release-cache lock; give the second `ORCA_DISABLE_SHARED_RELEASE_CACHE=1`.
- On GitHub the gate is `.github/workflows/fork-pr.yml`'s "Fork PR checks passed" job: `fork-check-static`, full-suite `fork-check-tests` shards, `fork-check-e2e` under Xvfb, `fork-check-wire` (the fork client talks to upstream-release hosts), `fork-check-mobile`, and an ad-hoc signed macOS arm64 `make fork-dmg`, the release build minus signing and notarization. Upstream workflows stay unedited but disabled on the fork; run `make fork-ci-disable-upstream` after a rebase that adds new ones.
- `make fork-check-seams` runs the seam contract tests listed in `config/fork-seam-tests.txt`; `fork-check-lint` fails when a listed path is missing or duplicated, or when any test the fork added is collected by no runner (unit config or a `tests/e2e` spec), so a renamed or misnamed test cannot drop out silently.
- `config/scripts/fork-pr-gate-needs.mjs` (in `fork-check-lint`) fails when `verify` could pass without every other `fork-pr.yml` job succeeding.
- `config/scripts/fork-upstream-api.mjs` (in `fork-check-lint`) fails when an upstream symbol pinned in `config/fork-upstream-api.txt` is no longer exported. Fork code prefers a public upstream symbol, then a copy of a small pure one in a fork file (naming its upstream origin), over adding `export` to an upstream internal; pin only what it cannot copy.
- `FORK_BASE` is the newest upstream `vX.Y.Z` tag. A clone without upstream tags resolves an ancient one; the target now refuses to run then, and when no tag resolves at all. Fix with `git fetch <upstream-remote> --tags`.
- The target forces `LC_ALL=C`: upstream real-git tests match English git messages and fail under a translated locale.
- `fork-check-lint` runs upstream's `pnpm lint` steps from `package.json` via `config/scripts/fork-lint-run.mjs`, minus its `EXCLUDED`, which fails once upstream drops an excluded step.
- A fork file that an upstream census or ratchet must list (`config/*-baseline.txt`, `src/shared/wsl-move/*-dispositions.ts`) gets its own entry there; on a rebase conflict in those files keep both sides.
- A branch cut from `develop` before a rebase moved it: `git rebase --onto fork/develop <its old merge-base>`. A plain rebase replays the old upstream range along with it.
- Keep `git config rerere.enabled true` so a conflict resolved once replays on the next rebase.
- Rebase with `git rebase --onto vNEW vOLD`: upstream release tags are side commits (`release: vX.Y.Z` on a branch), so the old tag is not an ancestor of the new one and a plain `git rebase vNEW` replays the old release commit into a `package.json` conflict.
- A new fork UI string goes into every locale file (seven since v1.4.238 added `pt.json`), not only `en.json`: `fork-locale-parity.mjs` in `fork-check-lint` fails otherwise. This is the one place a fork change grows an upstream file on purpose; don't drop translations to keep the upstream diff small.
- Locale files (`src/renderer/src/i18n/locales/*`) that conflict: keep both sides, since fork keys are pure additions. Don't take upstream's side and regenerate: `sync:localization-catalog` re-adds only English, so the fork's translations in the other locales would be lost. Then run `pnpm run verify:localization-catalogs`.
- Typecheck (`pnpm tc:web` / `tc:node`) before committing; tests alone pass with type errors.
- `typecheck:e2e` is not in the gate: upstream's own `tests/tools` fixtures fail it at the release tag.

## Who checks what

- Local checks (`make fork-check-full`, on the macmini) find problems before a push. They report; they never decide that a failure is safe. Don't add automatic exemptions (rerun until it passes, compare against `FORK_BASE`) to a fork-check target: every such exemption tried so far let a regression exit 0 in a way the next Codex round found.
- `make fork-canary` merges `HEAD` (`CANARY_REF`) into upstream `main` (`CANARY_UPSTREAM_REF`) in a throwaway worktree, takes upstream's side of each conflicted file, then runs `pnpm install`, `pnpm tc`, every unit test the fork added or changed and the whole seam list, and writes `out/fork-canary/<UTC time>-<pid>/report.md` (`latest.txt` names the newest), marking findings in a conflicted file; a failure there may come from the reset or be real. Report-only, never a gate: the report's `Result` line says green or which of conflicts, typecheck and tests failed (exit codes in the script header). rerere replays recorded resolutions but nothing is committed, so it records none. It deletes only its own worktree: leftovers from killed runs are listed in the report, and old run dirs stay until `rm -rf out/fork-canary`. Run it daily to see the next rebase's conflicts and breaks before the tag lands.
- `make fork-footprint` (`JSON=1` for JSON) prints the fork's diff on upstream files since `FORK_BASE`: added files, and modified files with lines split into production, tests, locales, baselines and other. Watch the production number; it is what rebases pay for.
- Fork CI on Linux is the only merge gate. A red job gets one automatic `gh run rerun <run> --failed`; red again is a real failure. That rerun lives at the CI level only, never inside a `fork-check-*` target. An install step that fails with `Could not reach https://registry.npmjs.org/...` is an npm outage, not the change: check https://status.npmjs.org, curl that exact URL until it answers, then `gh run rerun <run> --failed`. Leave the workflow alone.
- Codex is the deep backstop after the agent's own review, continuing one thread. Each round's prompt names the head SHA and lists what earlier rounds fixed and what they refuted, with the refuting evidence, so a refuted finding returns only with new evidence. Plan on three rounds at most. After round three, stop and diagnose each open blocker against the evidence: a flawed design, a wrong reviewer or judge assumption, or a broken validation setup. Propose what that diagnosis supports (for a design flaw, preferably a simpler design that removes the risky capability) and ask before patching or reviewing further.

## Unattended merges

- A feature PR merges into `develop` without the user once the finish pipeline is done (simplify, code-review, Codex deep test with no open blocker, an lcu round when it changes UI) and "Fork PR checks passed" is green with `develop` at its current head: `gh pr merge <n> --merge`. A blocker the pipeline could not settle leaves it open for the user.
- The auto-rebase pipeline (`orca-fork-auto-rebase` skill) moves `develop` when the rebase is CLEAN, or MANUAL with every resolved hunk and fix commit guarded by a test shown to turn red when that hunk is reverted, no Claude reviewer blocker left unfixed or unrefuted, Codex's last round ACCEPTABLE, and no untested seam among the resolved hunks. It pushes the sha Fork CI verified with a lease on the develop it rebased; when develop moved meanwhile it drops the attempt and the next run starts over. It then releases. Anything short of that leaves a verified PR for the user.
- While a `rebase/*` branch exists on the fork, an auto-rebase is in flight: hold merges into `develop` until it is gone, or its `--force-with-lease` push fails and the attempt is dropped and redone from the new `develop`.
- Both pipelines' skills live in `.claude/skills/orca-fork-*/` and change through a PR like any fork file. Upstream ignores `/.claude/skills/`, so a new file there needs `git add -f`. Their Orca automations open a fresh worktree on `fork/develop` (not the local `develop`) and run each skill's `scripts/precheck.sh` as read from `fork/develop`; only the automation definitions, `BARK_URL` (Doppler) and the shared precheck alert script stay on the machine.
- Closing a seam test gap the reviewers report is what lets the next MANUAL rebase move on its own; treat those gaps as debt.

## Release

- `main` is a pointer, never a merge target: develop is rebased on every upstream release, so main only follows by force-push. Move it yourself when a develop commit is worth installing.
- The commit: the merge commit of a feat → `develop` PR whose "Fork PR checks passed" ran with `develop` at its current head, merged with the merge-commit method (squash and rebase create a sha no run tested). After a rebase of `develop` that skipped a PR, it must pass `make fork-check-full` first. The auto-rebase release is the exception: its head is the commit Fork CI verified, and on macOS `fork-check-full` always fails upstream's own tests, so it cannot be a machine gate.
- From the dev clone (remote `fork`): move `main` and push an **annotated** tag (N counts up per upstream X.Y.Z); its message becomes the release notes (Chinese, user-visible changes since the last release):

  ```sh
  old=$(git ls-remote fork refs/heads/main | cut -f1)
  git tag -a vX.Y.Z-fork.N <sha> -F notes.md && git push --atomic --force-with-lease=main:$old fork <sha>:main vX.Y.Z-fork.N
  ```

- The tag push runs `.github/workflows/fork-release.yml` on a macOS arm64 runner: it refuses a tag that is not fork `main` or whose commit is not on fork `develop` (a commit an earlier published release shipped is let through, since a later rebase rewrites `develop`: a rerun, or a rollback re-tagging the last good release), builds `make fork-dmg`, publishes the GitHub Release with the dmg and its SHA-256, and bumps `audichuang/homebrew-tap`'s `Casks/orca-fork.rb`. It signs with the fork's Developer ID (`Developer ID Application: Yung Chun Chuang (37HFR5V2JJ)`) and notarizes, so keychain and TCC grants survive updates; a step fails the release when the app is not Developer-ID signed, stapled and accepted by `spctl`. Secrets: `APPLE_CERTIFICATE` (base64 p12 with the Developer ID G2 intermediate) and `APPLE_CERTIFICATE_PASSWORD`, plus the App Store Connect API key `APPLE_API_KEY_P8` / `APPLE_API_KEY_ID` / `APPLE_API_ISSUER`, all shared with aghub and backed up in 1Password (Agent vault, items titled `aghub …`); the cert expires 2027-11-23, and each release warns once it is within 60 days. `HOMEBREW_TAP_TOKEN` (fine-grained PAT, Contents write on the tap). Re-running the workflow on the same tag replaces the dmg and notes.
- Releases build on hosted `macos-15`. The repo variable `FORK_RELEASE_RUNNER` can name a self-hosted runner label instead; one was tried on the macmini (about 1.5 min faster) and dropped: it needs the login keychain unlocked (LaunchAgent without `SessionCreate`, a logged-in user) and exposes that keychain to jobs from a public repo.
- To test a workflow change without releasing, push an annotated `fork-release-dryrun-<anything>` tag (`fork-release-dryrun-hosted-<anything>` forces the hosted runner): it builds and signs, prints the release notes, uploads the dmg as an artifact, and skips the release and the tap. Delete the tag afterwards.
- `make fork-dmg FORK_VERSION=X.Y.Z-fork.N` still builds locally when CI is unavailable, signed and notarized like CI: the Developer ID must be in the keychain (p12 in 1Password, Agent vault, `aghub Developer ID Application p12`) and `APPLE_API_KEY` (.p8 path), `APPLE_API_KEY_ID`, `APPLE_API_ISSUER` set. `FORK_SIGN_IDENTITY=-` builds ad-hoc without notarization. The fork builder config excludes untracked checkout entries, and the build fails if app.asar still ships one: local dmgs once leaked `.orca/drops` screenshots and `CLAUDE.local.md`.
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
- **List it**: a new seam test joins its group in `config/fork-seam-tests.txt`, so `fork-check-seams` runs it and the auto-rebase mutation pass finds it.
- **Prove the test bites**: remove the fix or mutate the seam and watch it fail before trusting a green run.
- **Fork cases go in a sibling** `<basename>.fork.test.ts(x)` next to the upstream test, never appended to the upstream file, so rebases do not conflict there. Edit an upstream test only where the fork deliberately changed upstream behavior, and keep that edit minimal.
- Keep a contract test inside one layer; a main test importing renderer code (or the reverse) breaks the tsconfig projects. Write one contract per side of the seam instead.

To measure coverage after a large rebase, run a mutation pass: list the seams, apply plausible upstream edits one at a time in a separate checkout, and record which tests go red.

The release UI set (ClipCode copy, Paste & Restore, the folder repo list, session restore, the external-change banner, agent launch cwd) runs as fork e2e in a hidden window: `folder-multi-repo-source-control.spec.ts` and `folder-workspace-tab-restart-restore.spec.ts`. A new fork UI behaviour that ships joins that set as an e2e scenario. What only hands-on UI rounds catch: long-session state, real clipboard round trips with the ClipCode plugins, focus, hover and how the change feels; run them for PRs that add or change UI, not before every release.

## Upstream-file conventions

- `max-lines` cannot be disabled. When fork wiring pushes an upstream file over, move fork code out first. If upstream code has to move, open the new file with a comment naming where it came from, so rebases port upstream edits to it.
- Keep fork additions to upstream components as typed slots (`GitHistoryPanelSlots`) rather than inline branches, and carry fork values in an options object rather than new trailing positional params, which conflict at every call site. A refactor of fork wiring must lower `make fork-footprint`'s production number; compare before and after.
- A cast needs its `oxlint-disable-next-line … -- SAFETY:` comment on the line directly above the `as`, or the quality gate flags it.
- Every nested `AGENTS.md` has a sibling `CLAUDE.md` containing `@AGENTS.md`. The root `CLAUDE.md` and any `CLAUDE.local.md` make Claude Code skip `AGENTS.md` files, so without the sibling a subdirectory's rules never load for it. When a rebase brings a new nested `AGENTS.md`, add its `CLAUDE.md`.

## Running tests on another machine

Before handing tests to a remote checkout, sync it in the same command: the commit equals local `HEAD`, upstream tags are fetched, `pnpm install --frozen-lockfile` if the lockfile moved, and no previous run is still going. A test that passes alone but fails in a loaded run is not proven flaky or pre-existing: run the same shard at `FORK_BASE` before excluding it. Files run isolated, so the usual cause is real timers an earlier test in the same file never stopped, not another file's state.
