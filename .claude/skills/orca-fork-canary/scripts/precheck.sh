#!/bin/bash
# Orca fork canary precheck (run from fork/develop by the automation): skip while an auto-rebase run holds the fork's rebase/* lock (it needs the machine more).
set -euo pipefail
cd "$HOME/Project/orca"
if [ -n "$(git ls-remote fork 'refs/heads/rebase/*' | head -1)" ]; then
  echo "auto-rebase in flight; canary skipped"
  exit 1
fi
