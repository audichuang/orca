#!/usr/bin/env bash
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/env.sh"
reset_fixture
cd $P/WebApp
rm src/staged-mod.ts
printf 'new\n' > src/added-then-removed.ts && git add src/added-then-removed.ts && rm src/added-then-removed.ts
git status --porcelain | grep -E 'staged-mod|added-then' | tee /dev/stderr | grep -q '^MD' 
