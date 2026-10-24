#!/usr/bin/env bash
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/env.sh"
. "$(dirname "${BASH_SOURCE[0]}")/ed-lib.sh"
cd "$P/docs-site" && printf 'r\n' > README.md && printf 'i\n' > index.md && git add -A
