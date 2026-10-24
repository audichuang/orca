#!/usr/bin/env bash
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/env.sh"
test -d $P/notes && test ! -e $P/notes/.git || { mkdir -p $P/notes; echo note > $P/notes/todo.txt; }
