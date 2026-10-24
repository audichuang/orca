#!/usr/bin/env bash
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/env.sh"
T=$ROOT
P=$T/MultiProduct
reset() { reset_fixture; }
reset
pbcopy < "$T/payloads/RS-08"
rm -f "$T/escape2.txt"
shasum "$P/WebApp/.git/config" > "$T/RS-08.sha"
