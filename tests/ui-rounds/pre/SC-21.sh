#!/usr/bin/env bash
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/env.sh"
reset_fixture
Z=$P/zero; for r in solo duo; do mkdir -p $Z/$r && git -C $Z/$r init -q -b main && git -C $Z/$r config user.name t && git -C $Z/$r config user.email t@x.invalid && echo $r > $Z/$r/a.txt && git -C $Z/$r add -A && git -C $Z/$r commit -qm init; done; echo change >> $Z/solo/a.txt
