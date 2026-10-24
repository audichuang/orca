#!/usr/bin/env bash
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/env.sh"
T=$ROOT
P=$T/MultiProduct
reset() { reset_fixture; }
reset
pbcopy < "$T/payloads/RS-07"
shasum "$P/notes/todo.txt" "$P/WebApp/.git/HEAD" > "$T/RS-07.sha"
