#!/usr/bin/env bash
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/env.sh"
. "$(dirname "${BASH_SOURCE[0]}")/ed-lib.sh"
ed_q1_snapshot "$OT/ed-ss01-before.txt"
ed_stop; ed_start
