#!/usr/bin/env bash
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/env.sh"
reset_fixture
I=$P/docs-site/plugins/inner; mkdir -p $I && git -C $I init -q -b main && git -C $I config user.name t && git -C $I config user.email t@x.invalid && echo inner > $I/index.md && git -C $I add -A && git -C $I commit -qm init && echo 'inner change' >> $I/index.md && echo 'outer change' >> $P/docs-site/index.md
