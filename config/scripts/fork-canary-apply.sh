#!/usr/bin/env bash
# Applies the canary's cached resolutions to the files of the current rebase stop.
#
#   fork-canary-apply.sh <canary run dir> <file>...
#
# <canary run dir> is $HOME/.cache/orca-fork-canary/<run>: report.md names the upstream main sha U the canary merged
# into, resolution/files/<path> holds the file as resolved against U. The fork side is REBASE_HEAD (override with
# $FORK_SIDE; U with $CANARY_UPSTREAM). Per file: fork side == U -> take the cached file; otherwise
# `git merge-file cached U fork-side`, which carries over the part of the fork commit the cache lacks.
# A file is written only when that applies cleanly; the rest are left untouched. Exit 0: all applied, 1: some did
# not apply (reason printed), 2: usage or setup error. Results are never staged; review them, then run
# fork-rebase-continue.sh.
set -euo pipefail

[ $# -ge 2 ] || { echo "usage: $0 <canary run dir> <file>..." >&2; exit 2; }
cache=$1
shift
files_dir=$cache/resolution/files
[ -d "$files_dir" ] || { echo "fork-canary-apply: no $files_dir" >&2; exit 2; }

upstream=${CANARY_UPSTREAM:-}
if [ -z "$upstream" ]; then
  [ -f "$cache/report.md" ] || { echo "fork-canary-apply: no $cache/report.md and CANARY_UPSTREAM unset" >&2; exit 2; }
  upstream=$(sed -nE 's/^- Upstream: `([0-9a-f]{7,40})`.*/\1/p' "$cache/report.md" | head -n 1)
fi
[ -n "$upstream" ] || { echo "fork-canary-apply: cannot find the upstream sha in $cache/report.md" >&2; exit 2; }
upstream=$(git rev-parse --verify "$upstream^{commit}") || { echo "fork-canary-apply: upstream $upstream is not in this repo (git fetch origin main)" >&2; exit 2; }
side=${FORK_SIDE:-REBASE_HEAD}
git rev-parse --verify -q "$side^{commit}" > /dev/null || { echo "fork-canary-apply: $side does not exist (not stopped in a rebase?)" >&2; exit 2; }

cd "$(git rev-parse --show-toplevel)"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
failed=0

for f in "$@"; do
  if [ ! -f "$files_dir/$f" ]; then
    echo "NO-CANARY $f: not in $files_dir"
    failed=1
    continue
  fi
  git show "$upstream:$f" > "$tmp/upstream" 2> /dev/null || : > "$tmp/upstream"
  git show "$side:$f" > "$tmp/fork" 2> /dev/null || : > "$tmp/fork"
  if cmp -s "$tmp/upstream" "$tmp/fork"; then
    cp "$files_dir/$f" "$tmp/out"
    how=FINAL
  else
    cp "$files_dir/$f" "$tmp/out"
    rc=0
    git merge-file "$tmp/out" "$tmp/upstream" "$tmp/fork" || rc=$?
    if [ "$rc" -ne 0 ]; then
      echo "CONFLICT $f: cached resolution and this fork commit disagree ($rc hunks); file untouched"
      failed=1
      continue
    fi
    how=MERGED
  fi
  mkdir -p "$(dirname "$f")"
  cp "$tmp/out" "$f"
  echo "$how $f"
done
exit "$failed"
