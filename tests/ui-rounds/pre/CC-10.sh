#!/usr/bin/env bash
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/env.sh"
reset_fixture
cd $P/docs-site
python3 -I -c "open('size-a-512000.txt','w').write('x'*511999+'\n'); open('size-b-512001.txt','w').write('x'*512000+'\n'); open('size-c-cjk.txt','w',encoding='utf-8').write('中'*170667)"
wc -c size-*.txt
