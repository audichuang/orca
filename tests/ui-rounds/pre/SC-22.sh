#!/usr/bin/env bash
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/env.sh"
reset_fixture
C2=$P/libs/other/core; mkdir -p $C2 && git -C $C2 init -q -b main && git -C $C2 config user.name t && git -C $C2 config user.email t@x.invalid && echo two > $C2/core.ts && git -C $C2 add -A && git -C $C2 commit -qm init
