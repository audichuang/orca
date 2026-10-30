#!/bin/sh
# Fork-only: run an unattended child agent (`claude -p`, codex-companion) without the Orca pane identity it inherits.
# Why: its hooks would report as the pane's own agent, and an Orca automation ends the run on that agent's Stop:
# auto-rebase run 219 (v1.4.245) died when reviewer A finished, with Codex and reviewer C3 still running.
# Usage: fork-detached-agent.sh <command> [args...]
exec env -u ORCA_PANE_KEY -u ORCA_AGENT_PANE -u ORCA_AGENT_LAUNCH_TOKEN -u ORCA_AGENT_LAUNCH "$@"
