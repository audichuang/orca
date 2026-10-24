#!/usr/bin/env bash
. "$(dirname "${BASH_SOURCE[0]}")/env.sh"
# V1 案例前置:重置 fixture、清掉逃逸測試檔,再放好剪貼簿內容
set -euo pipefail
reset_fixture
rm -f "$ROOT/escape.txt" /tmp/orca-ui-abs-escape.txt
printf '%s\n' '// clipcode-root: MultiProduct' '// file: [MODIFIED] WebApp/git-alias/config' 'pwned' | pbcopy
