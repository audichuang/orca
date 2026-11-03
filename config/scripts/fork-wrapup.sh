#!/usr/bin/env bash
# Read-only wrap-up after a fork release (make fork-wrapup): release tag vs Homebrew tap vs installed app, stale worktrees.
# Prints suggested commands; deletes nothing. A failing ssh or gh only warns.
set -uo pipefail

fork_remote=${FORK_REMOTE:-fork}
fork_repo=${FORK_REPO:-audichuang/orca}
tap_repo=${TAP_REPO:-audichuang/homebrew-tap}
mac_host=${MAC_HOST:-macbookpro}

echo "== release"
tag=$(gh api "repos/$fork_repo/releases/latest" --jq .tag_name 2> /dev/null || true)
[ -n "$tag" ] || tag=$(git ls-remote --sort=-v:refname --tags --refs "$fork_remote" 'v*-fork.*' 2> /dev/null |
  sed -E 's|.*refs/tags/||' | head -n 1)
echo "latest fork tag: ${tag:-unknown}"
tap_version=$(gh api "repos/$tap_repo/contents/Casks/orca-fork.rb" --jq .content 2> /dev/null | base64 -d 2> /dev/null |
  sed -nE 's/^[[:space:]]*version[[:space:]]+"([^"]+)".*/\1/p' | head -n 1)
echo "tap cask version: ${tap_version:-unknown (gh api failed)}"
want=${tag#v}
if [ -n "$tap_version" ] && [ -n "$want" ] && [ "$tap_version" != "$want" ]; then
  echo "WARN: tap is not at $tag; the release workflow's 'Bump the Homebrew cask' job may need: gh run rerun <id> --failed -R $fork_repo"
fi

echo "== installed on $mac_host"
installed=$(ssh -o ConnectTimeout=10 -o BatchMode=yes "$mac_host" \
  "bash -lc 'export PATH=/opt/homebrew/bin:/usr/bin:/bin:\$PATH; brew info --cask orca-fork | head -1'" 2> /dev/null) || installed=
if [ -z "$installed" ]; then
  echo "WARN: could not read the installed version over ssh $mac_host"
else
  echo "$installed"
  if [ -n "$tap_version" ] && ! grep -qF "$tap_version" <<< "$installed"; then
    echo "behind the tap; upgrade (ask the user to quit Orca Fork first):"
    echo "  ssh $mac_host \"bash -lc 'export PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:\\\$PATH; brew update >/dev/null; brew upgrade --cask orca-fork'\""
  fi
fi

echo "== stale worktrees (branch merged into $fork_remote/develop or gone from $fork_remote)"
main_wt=$(git worktree list --porcelain | sed -n '1s/^worktree //p')
develop="refs/remotes/$fork_remote/develop"
git rev-parse --verify -q "$develop" > /dev/null || { echo "WARN: $develop missing; run git fetch $fork_remote"; exit 0; }
found=0
path=
branch=
report() {
  [ -n "$path" ] && [ "$path" != "$main_wt" ] || return 0
  case "$path" in *auto-orca-fork-rebase-run-* | *auto-orca-fork-canary-run-*) return 0 ;; esac
  case "$(basename "$path")" in ar-*) return 0 ;; esac
  [ -n "$branch" ] || return 0
  local why=
  if ! git rev-parse --verify -q "refs/remotes/$fork_remote/$branch" > /dev/null; then
    why="not on $fork_remote"
    # Why: a branch never pushed is not merged work; only call it stale when its commits are already in develop.
    git merge-base --is-ancestor "refs/heads/$branch" "$develop" 2> /dev/null || why=
  elif git merge-base --is-ancestor "refs/heads/$branch" "$develop" 2> /dev/null; then
    why="merged into $fork_remote/develop"
  fi
  [ -n "$why" ] || return 0
  found=1
  local dirty=clean
  [ -z "$(git -C "$path" status --porcelain 2> /dev/null)" ] || dirty="UNCOMMITTED CHANGES"
  echo "- $path"
  echo "    branch: $branch ($why), $dirty"
  if [ "$dirty" = clean ]; then
    echo "    remove: git worktree remove \"$path\" && git branch -d \"$branch\""
  else
    echo "    inspect first: git -C \"$path\" status"
  fi
}
while IFS= read -r line; do
  case "$line" in
    "worktree "*) report; path=${line#worktree }; branch= ;;
    "branch refs/heads/"*) branch=${line#branch refs/heads/} ;;
  esac
done < <(git worktree list --porcelain; echo)
report
[ "$found" = 1 ] || echo "none"
echo "(Orca-managed worktrees: use orca worktree rm --worktree \"id:<repoId>::<path>\" --force --json instead)"
exit 0
