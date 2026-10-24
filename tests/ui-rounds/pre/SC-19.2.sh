#!/usr/bin/env bash
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/env.sh"
# 前置:SC-19.1 已把 WebApp 的 Other locations 設為 Hide。每次都用不同路徑與分支
N=$(date +%s)
git -C $P/WebApp worktree add -q ../WebApp-hidden-$N -b hidden/x-$N
echo hid >> $P/WebApp-hidden-$N/README.md
echo $N > $ROOT/sc19-n.txt
echo $N
