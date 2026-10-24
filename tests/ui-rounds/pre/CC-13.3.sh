#!/usr/bin/env bash
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/env.sh"
git -C $P/docs-site clean -fdq
: > $P/docs-site/empty.txt
