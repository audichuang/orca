#!/usr/bin/env bash
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/env.sh"
. "$(dirname "${BASH_SOURCE[0]}")/ed-lib.sh"
# 工具限制:衝突列的 Stage 是 hover 按鈕,AX 抓不到,改用 git add 代替按 Stage
git -C "$P/docs-site" add index.md
