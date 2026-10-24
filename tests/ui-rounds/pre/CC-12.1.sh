#!/usr/bin/env bash
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/env.sh"
reset_fixture
cd $P/docs-site
printf 'ok\n' > ok.txt
printf '<svg xmlns="http://www.w3.org/2000/svg"/>\n' > icon.svg
python3 -I -c "open('nul-late.txt','wb').write(b'a'*9000+b'\x00b\n'); open('big50.txt','wb').write(b'a\n'*(26*1024*1024+1))"
