#!/usr/bin/env bash
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/env.sh"
. "$(dirname "${BASH_SOURCE[0]}")/ed-lib.sh"
date +%s > "$OT/ed08-t0"
echo ext-combined >> "$P/WebApp/src/unstaged-mod.ts"
