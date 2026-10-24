#!/usr/bin/env bash
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/env.sh"
. "$(dirname "${BASH_SOURCE[0]}")/ed-lib.sh"
# 外部改 WebApp-feature 的檔
echo ext-feature >> "$P/WebApp-feature/src/unstaged-mod.ts"
