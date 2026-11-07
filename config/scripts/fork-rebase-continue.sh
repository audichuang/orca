#!/usr/bin/env bash
# Finishes one conflict stop of the auto-rebase: records the resolved files, stages, continues, reports the next stop.
#
#   fork-rebase-continue.sh <review-dir> [extra resolved file]...
#
# Run after the conflicts of the current stop are resolved in the work tree. Appends the unmerged files (plus
# any extra paths, for files already `git add`ed) to <review-dir>/resolved-files.txt without duplicates, then
# `git add -A` and `GIT_EDITOR=true git rebase --continue`; output goes to <review-dir>/rebase-cont-<n>.log.
# Exit 0: rebase finished. 1: stopped again (conflicts, or an empty commit to `git rebase --skip`). 2: other error,
# including leftover conflict markers (nothing is staged or continued then).
set -euo pipefail

[ $# -ge 1 ] || { echo "usage: $0 <review-dir> [extra resolved file]..." >&2; exit 2; }
dir=$1
shift
mkdir -p "$dir"

in_rebase() {
  [ -d "$(git rev-parse --git-path rebase-merge)" ] || [ -d "$(git rev-parse --git-path rebase-apply)" ]
}
in_rebase || { echo "fork-rebase-continue: no rebase in progress" >&2; exit 2; }

# Paths come from git, run from the repo top so they resolve for grep and for resolved-files.txt.
cd "$(git rev-parse --show-toplevel)"

unmerged=$(git diff --name-only --diff-filter=U)
marked=
if [ -n "$unmerged" ]; then
  # Why not git diff --check: it also flags whitespace; only conflict markers block here.
  marked=$(printf '%s\n' "$unmerged" | while IFS= read -r f; do
    [ -f "$f" ] && grep -qE '^(<<<<<<<|>>>>>>>) ' "$f" && echo "$f"
  done || true)
fi
if [ -n "$marked" ]; then
  echo "fork-rebase-continue: conflict markers left, not continuing:" >&2
  printf '  %s\n' $marked >&2
  exit 2
fi

list=$dir/resolved-files.txt
touch "$list"
{
  cat "$list"
  printf '%s\n' "$unmerged"
  for f in "$@"; do printf '%s\n' "$f"; done
} | awk 'NF && !seen[$0]++' > "$list.tmp"
mv "$list.tmp" "$list"

stopped=$(git rev-parse --short REBASE_HEAD 2>/dev/null || true)
if [ -n "$stopped" ]; then
  echo "--- $stopped $(git log -1 --format=%s REBASE_HEAD)" >> "$dir/conflict-log.txt"
fi

n=1
while [ -e "$dir/rebase-cont-$n.log" ]; do n=$((n + 1)); done
log=$dir/rebase-cont-$n.log

git add -A
rc=0
GIT_EDITOR=true git rebase --continue > "$log" 2>&1 || rc=$?

if ! in_rebase; then
  if [ "$rc" -eq 0 ]; then
    echo "REBASE DONE (log: $log)"
    exit 0
  fi
  echo "fork-rebase-continue: rebase ended with exit $rc; see $log" >&2
  tail -n 5 "$log" >&2
  exit 2
fi

next=$(git diff --name-only --diff-filter=U)
head_sha=$(git rev-parse --short REBASE_HEAD 2>/dev/null || true)
subject=$(git log -1 --format=%s REBASE_HEAD 2>/dev/null || true)
if [ -n "$next" ]; then
  echo "STOPPED at $head_sha $subject (log: $log)"
  echo "conflicts:"
  printf '  %s\n' $next
  exit 1
fi
if [ "$rc" -ne 0 ] && grep -qiE 'nothing to commit|previous cherry-pick is now empty|git rebase --skip' "$log"; then
  echo "EMPTY commit $head_sha $subject: run 'git rebase --skip' (log: $log)"
  exit 1
fi
echo "fork-rebase-continue: rebase still in progress without conflicts (exit $rc); see $log" >&2
tail -n 5 "$log" >&2
exit 2
