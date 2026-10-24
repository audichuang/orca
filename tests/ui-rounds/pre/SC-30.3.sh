#!/usr/bin/env bash
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/env.sh"
rm -f $P/libs/shared/core/.git/hooks/pre-commit
