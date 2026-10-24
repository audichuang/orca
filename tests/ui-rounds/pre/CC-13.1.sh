#!/usr/bin/env bash
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/env.sh"
reset_fixture
printf '你好，世界 👍\ncafé\n' > "$P/docs-site/中文 檔名.md"
