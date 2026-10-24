#!/usr/bin/env bash
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/env.sh"
for d in $P/WebApp-cc05-*; do
  [ -d "$d" ] || continue
  n=${d##*-}
  git -C $P/WebApp worktree remove --force "../WebApp-cc05-$n"
  git -C $P/WebApp branch -D "cc05/x-$n" >/dev/null
done
git -C $P/WebApp worktree prune
