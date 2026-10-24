#!/usr/bin/env bash
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/env.sh"
reset_fixture
printf 'caf\xe9\n' > $P/docs-site/latin1.txt
