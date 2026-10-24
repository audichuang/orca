#!/usr/bin/env bash
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/env.sh"
T=$ROOT
P=$T/MultiProduct
reset() { reset_fixture; }
reset
printf "RS-01 sentinel" | pbcopy   # 讓後面的複製一定造成剪貼簿變化
