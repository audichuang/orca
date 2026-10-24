#!/usr/bin/env bash
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/env.sh"
reset_fixture
C=$P/libs/shared/core
printf '#!/bin/sh\necho "blocked by ui test hook" >&2\nexit 1\n' > $C/.git/hooks/pre-commit
chmod +x $C/.git/hooks/pre-commit
