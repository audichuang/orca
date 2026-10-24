#!/usr/bin/env bash
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/env.sh"
N=$(cat $ROOT/sc19-n.txt)
git -C $P/WebApp worktree remove --force ../WebApp-hidden-$N
git -C $P/WebApp branch -D hidden/x-$N >/dev/null
git -C $P/WebApp worktree prune
rm -f $ROOT/sc19-n.txt
