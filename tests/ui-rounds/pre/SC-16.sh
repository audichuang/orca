#!/usr/bin/env bash
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/env.sh"
reset_fixture
# 衝突前置 CF(04-ed.md)
cd $P/docs-site
git switch -q -c side; printf 'docs\nside change\n' > index.md; printf 'side readme\n' > README.md
git add -A && git commit -qm side
git switch -q main; printf 'docs\nmain change\n' > index.md; printf 'main readme\n' > README.md
git add -A && git commit -qm main
git merge side >/dev/null || true
git status --short
