#!/usr/bin/env bash
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/env.sh"
R=round; bash "$UIR/$R.sh" reset >/dev/null   # 刻意不寫成 reset_fixture: 讓 plan 不判成重置後(否則重啟後先跑 afterReset 會預載面板,破壞競態前置)
app_stop
app_start
