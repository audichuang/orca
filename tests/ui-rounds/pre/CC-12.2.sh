#!/usr/bin/env bash
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/env.sh"
cd $P/docs-site
rm -f ok.txt big50.txt
