#!/usr/bin/env bash
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/env.sh"
reset_fixture
U=$P/unimported; mkdir -p $U && git -C $U init -q -b main && git -C $U config user.name t && git -C $U config user.email t@x.invalid && echo a > $U/a.txt && git -C $U add -A && git -C $U commit -qm init && echo b >> $U/a.txt
