#!/usr/bin/env bash
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/env.sh"
T=$ROOT
P=$T/MultiProduct
reset() { reset_fixture; }
reset
pbcopy < "$T/payloads/RS-10"
ls -d "$P/WEBAPP" >/dev/null   # 沒輸出 = 檔案系統區分大小寫,此案不適用
shasum "$P/WebApp/.git/config" > "$T/RS-10.sha"
