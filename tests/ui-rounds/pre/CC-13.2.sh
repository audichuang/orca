#!/usr/bin/env bash
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/env.sh"
git -C $P/docs-site clean -fdq
printf 'a\r\nb\r\n' > $P/docs-site/crlf.txt
