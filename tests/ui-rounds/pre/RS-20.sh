#!/usr/bin/env bash
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/env.sh"
T=$ROOT
P=$T/MultiProduct
reset() { reset_fixture; }
reset
mkdir "$P/notes/locked" && chmod 555 "$P/notes/locked"
pbcopy < "$T/payloads/RS-20"
