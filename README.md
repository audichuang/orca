# fork-canary-notes

State shared by the fork's unattended pipelines, kept apart from `develop` (no CI, never rebased):

- `known-resolutions.md`: conflicts and broken fork commits the daily canary found against upstream `main`, with how to resolve them. The auto-rebase follows it and deletes the entries a release consumed.
- `canary-last.json`: the last canary run's unattributed findings, compared on the next run to decide whether to notify.

Written only through `config/scripts/fork-notes.sh` (see the `orca-fork-canary` and `orca-fork-auto-rebase` skills in `.claude/skills/` on `develop`).
