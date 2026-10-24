#!/usr/bin/env bash
. "$(dirname "${BASH_SOURCE[0]}")/env.sh"
# V1-H6 前置:剪貼簿放非 ClipCode 內容(不改 fixture)
set -euo pipefail
printf 'hello' | pbcopy
