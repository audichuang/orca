#!/usr/bin/env bash
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/env.sh"
echo x >> $P/libs/shared/core/extra.ts
sleep 20
