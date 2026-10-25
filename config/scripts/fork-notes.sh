#!/usr/bin/env bash
# Reads and writes the fork's pipeline state on the orphan branch `fork-canary-notes` (no CI, never rebased).
#
#   fork-notes.sh tip                          fetch; print the branch tip sha
#   fork-notes.sh write <base-sha> <message> <file>=<local path>...
#                                              commit the files on top of <base-sha> and push
#
# Read with `git show <tip>:<file>`. `write` never forces: when the branch moved past <base-sha> (another
# run wrote meanwhile) the push is rejected and it exits 2; run `tip` again, reapply the edit, write again.
# Exit 0 also when nothing changed (no commit). Remote: $FORK_REMOTE (default `fork`).
set -euo pipefail

remote=${FORK_REMOTE:-fork}
branch=fork-canary-notes

tip() {
  git fetch -q "$remote" "+refs/heads/$branch:refs/remotes/$remote/$branch" || return 1
  git rev-parse "refs/remotes/$remote/$branch"
}

case ${1:-} in
  tip)
    tip
    ;;
  write)
    [ $# -ge 4 ] || { echo "usage: $0 write <base-sha> <message> <file>=<local path>..." >&2; exit 64; }
    base=$(git rev-parse --verify "$2^{commit}")
    message=$3
    shift 3
    index=$(mktemp)
    trap 'rm -f "$index"' EXIT
    GIT_INDEX_FILE=$index git read-tree "$base"
    for pair in "$@"; do
      name=${pair%%=*}
      path=${pair#*=}
      [ -n "$name" ] && [ "$name" != "$pair" ] && [ -f "$path" ] || { echo "not <file>=<existing path>: $pair" >&2; exit 64; }
      blob=$(git hash-object -w -- "$path")
      GIT_INDEX_FILE=$index git update-index --add --cacheinfo "100644,${blob},${name}"
    done
    tree=$(GIT_INDEX_FILE=$index git write-tree)
    if [ "$tree" = "$(git rev-parse "${base}^{tree}")" ]; then
      echo "no change"
      exit 0
    fi
    commit=$(git commit-tree "$tree" -p "$base" -m "$message")
    if ! git push -q "$remote" "${commit}:refs/heads/${branch}" 2>/dev/null; then
      now=$(tip) || exit 1
      if [ "$now" != "$base" ]; then
        echo "rejected: $branch moved to $now past $base; run tip, reapply, write again" >&2
        exit 2
      fi
      git push -q "$remote" "${commit}:refs/heads/${branch}"
    fi
    echo "$commit"
    ;;
  *)
    echo "usage: $0 tip | write <base-sha> <message> <file>=<local path>..." >&2
    exit 64
    ;;
esac
