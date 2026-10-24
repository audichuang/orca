#!/usr/bin/env bash
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/env.sh"
. "$(dirname "${BASH_SOURCE[0]}")/ed-lib.sh"
ed_reset
cd "$P/WebApp-feature" && echo 'feature commit line' >> src/staged-mod.ts && git add src/staged-mod.ts && git commit -qm 'feature commit'
