#!/usr/bin/env bash
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/env.sh"
. "$(dirname "${BASH_SOURCE[0]}")/ed-lib.sh"
ed_reset
: > "$P/WebApp/src/empty-new.ts"; : > "$P/docs-site/index.md"
