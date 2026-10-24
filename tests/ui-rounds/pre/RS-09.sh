#!/usr/bin/env bash
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/env.sh"
T=$ROOT
P=$T/MultiProduct
reset() { reset_fixture; }
reset
pbcopy < "$T/payloads/RS-09"
rm -f /tmp/orca-ui-unmatched.txt
[ "$(pbpaste | sed -n 6p)" = '// file: [NEW] C:\Users\Bob\multiproduct\notes\abs-win.txt' ] || { echo "RS-09 payload 第 6 行不對" >&2; exit 1; }
