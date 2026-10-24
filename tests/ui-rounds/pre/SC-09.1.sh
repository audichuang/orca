#!/usr/bin/env bash
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/env.sh"
reset_fixture
touch $P/WebApp/.git/index.lock
