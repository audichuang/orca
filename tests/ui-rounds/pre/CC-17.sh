#!/usr/bin/env bash
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/env.sh"
reset_fixture
cd $P/docs-site
python3 -I -c "open('lines.txt','w').write('i\n'*130000)"
git add lines.txt
echo worktree-tail >> lines.txt
