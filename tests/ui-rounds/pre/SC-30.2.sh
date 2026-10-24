#!/usr/bin/env bash
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/env.sh"
# 接續 SC-30.1(core.ts 已 stage、message 為 draft core):只裝 hook,不重置
C=$P/libs/shared/core
printf '#!/bin/sh\necho "blocked by ui test hook" >&2\nexit 1\n' > $C/.git/hooks/pre-commit
chmod +x $C/.git/hooks/pre-commit
