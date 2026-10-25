#!/bin/bash
# Orca automation precheck: exit 0 when upstream has a newer release than develop's base and no rebase run
# holds the fork's rebase/* lock, or when a held lock went stale (a run died; the skill's step 0 resumes it).
set -euo pipefail
trap 'rc=$?; m="precheck failed (exit $rc) at line $LINENO: $BASH_COMMAND"; echo "$m" >&2; "$HOME/.config/fork-automation/precheck-alert.sh" "Orca fork 自動 rebase" "$m" || true' ERR
cd "$HOME/Project/orca"
git fetch -q fork develop
git fetch -q origin --no-tags '+refs/tags/v*:refs/tags/v*'
# Upstream also pushes tags it never publishes as a Release (v1.4.236); only a published Release counts.
newest=$(gh api repos/stablyai/orca/releases/latest --jq .tag_name | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$')
base=$(git describe --tags --abbrev=0 --match 'v[0-9]*.[0-9]*.[0-9]*' --exclude '*-fork*' fork/develop)
echo "upstream=$newest develop-base=$base"
lock=$(git ls-remote fork 'refs/heads/rebase/*' | head -1)
if [ -n "$lock" ]; then
  branch=${lock#*refs/heads/}
  # Why stale after 6 h: a healthy run pushes or comments at every stage (longest gap ~3 h: Codex, a fix, CI); a dead one never resumes on its own.
  when=$(gh api "repos/audichuang/orca/commits/${lock%%[[:space:]]*}" --jq .commit.committer.date)
  pr=$(gh pr list -R audichuang/orca --head "$branch" --state open --json number,updatedAt --jq '.[0] // empty | "\(.number) \(.updatedAt)"')
  [ -n "$pr" ] && when=$(printf '%s\n%s\n' "$when" "${pr#* }" | sort | tail -1)
  age=$(( $(date +%s) - $(date -j -u -f '%Y-%m-%dT%H:%M:%SZ' "$when" +%s) ))
  verified=0
  [ -n "$pr" ] && verified=$(gh pr view "${pr%% *}" -R audichuang/orca --json comments --jq '[.comments[].body | select(startswith("<!-- auto-rebase:verified -->") or startswith("<!-- auto-rebase:needs-human -->"))] | length')
  if [ "$verified" = 0 ] && [ "$age" -gt 21600 ]; then
    echo "stale lock: $branch (${age}s since last activity)"
    exit 0
  fi
  echo "in flight: $branch"
  exit 1
fi
[ -n "$newest" ] && [ "$newest" != "$base" ] || exit 1
[ "$(printf '%s\n%s\n' "$base" "$newest" | sort -V | tail -1)" = "$newest" ] || exit 1
