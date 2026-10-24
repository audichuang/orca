#!/usr/bin/env bash
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/env.sh"
reset_fixture
for i in $(seq -w 1 20); do d=$P/many/r$i; mkdir -p $d; git -C $d init -q -b main; git -C $d config user.name t; git -C $d config user.email t@x.invalid; echo base > $d/f.txt; git -C $d add -A; git -C $d commit -qm init; echo "change $i" >> $d/f.txt; done
