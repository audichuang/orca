#!/usr/bin/env bash
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/env.sh"
T=$ROOT
P=$T/MultiProduct
reset() { reset_fixture; }
reset
pbcopy < "$UIR/payloads/RS-12"
shasum "$P/api-server/server.ts" "$P/libs/shared/core/core.ts" "$P/api-server/README.md" > "$T/RS-12.sha"
