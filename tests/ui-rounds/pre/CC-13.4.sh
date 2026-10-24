#!/usr/bin/env bash
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/env.sh"
git -C $P/docs-site clean -fdq
printf 'x\n' > "$P/docs-site/weird\$&\$\$name.ts"
