#!/usr/bin/env bash
. "$(dirname "${BASH_SOURCE[0]}")/env.sh"
# V1-E1.2 前置:不經 Orca 在 docs-site/index.md 追加一行(接在 V1-E1.1 之後,不重置)
set -euo pipefail
echo 'e1 external line' >> "$P/docs-site/index.md"
