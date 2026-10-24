#!/usr/bin/env bash
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/env.sh"
# 預設選取只在本次啟動還沒選過 repo 時看得到:重啟 Orca
reset_fixture
app_stop
app_start
