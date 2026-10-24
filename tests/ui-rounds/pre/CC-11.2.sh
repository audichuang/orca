#!/usr/bin/env bash
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/env.sh"
cd $P/docs-site
for i in 3 4; do python3 -I -c "open('t$i.txt','w').write(';'*511999+'\n')"; done
