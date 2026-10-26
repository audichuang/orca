#!/bin/bash
# Orca fork canary precheck (the automation runs it as read from fork/develop): skip only while an auto-rebase run is
# in flight (it needs the machine more). A rebase/* lock whose PR is verified and waiting for the user does not skip:
# that wait can last days, which is exactly when the canary's warnings matter.
set -euo pipefail
trap 'rc=$?; m="precheck failed (exit $rc) at line $LINENO: $BASH_COMMAND"; echo "$m" >&2; "$HOME/.config/fork-automation/precheck-alert.sh" "Orca fork canary" "$m" || true' ERR
cd "$HOME/Project/orca"
locks=$(git ls-remote fork 'refs/heads/rebase/*')
[ -n "$locks" ] || exit 0
while read -r _ ref; do
  branch=${ref#refs/heads/}
  pr=$(gh pr list -R audichuang/orca --head "$branch" --state open --json number --jq '.[0].number // empty')
  verified=0
  # Why develop-moved counts as in flight: the auto-rebase is releasing from a PR the user had been left.
  [ -n "$pr" ] && verified=$(gh pr view "$pr" -R audichuang/orca --json comments --jq 'if any(.comments[].body; startswith("<!-- auto-rebase:develop-moved ")) then 0 else [.comments[].body | select(startswith("<!-- auto-rebase:verified -->") or startswith("<!-- auto-rebase:needs-human -->"))] | length end')
  if [ "$verified" = 0 ]; then
    echo "auto-rebase in flight on $branch; canary skipped"
    exit 1
  fi
done <<<"$locks"
echo "only verified rebase PRs waiting for review; canary runs"
