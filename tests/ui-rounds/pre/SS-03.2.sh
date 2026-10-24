#!/usr/bin/env bash
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/env.sh"
. "$(dirname "${BASH_SOURCE[0]}")/ed-lib.sh"
ed_q1_snapshot "$OT/ed-ss03-before.txt"
ed_stop
ed_session_edit strip
ed_start
