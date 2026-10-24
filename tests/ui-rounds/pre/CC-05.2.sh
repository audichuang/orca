#!/usr/bin/env bash
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/env.sh"
# 前置:CC-05.1 已把 Other locations 設為 Hide。建立隱藏 worktree
N=$(date +%s)
git -C $P/WebApp worktree add -q ../WebApp-cc05-$N -b cc05/x-$N
echo cc05 >> $P/WebApp-cc05-$N/README.md
