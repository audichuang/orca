#!/usr/bin/env bash
# Fork canary: merge the fork into upstream main in a throwaway worktree, then typecheck and run the fork's tests.
# Report-only early warning before the next release tag; never a gate. Never pushes or touches the invoking checkout.
# Exit: 0 green, 1 install/typecheck/test failures, 2 merge conflicts (no typecheck), 3 setup error.
# Env: FORK_BASE (required), CANARY_REF (fork side, default HEAD), UPSTREAM_REMOTE, CANARY_UPSTREAM_REF
#      (default <upstream>/main), CANARY_DIR (default ../orca-fork-canary), CANARY_REPORT, CANARY_KEEP=1.
set -uo pipefail
export LC_ALL=C ORCA_BACKGROUND_LAUNCH=1

die() {
  echo "fork-canary: $*" >&2
  exit 3
}

root=$(git rev-parse --show-toplevel) || die "not in a git checkout"
cd "$root" || die "cannot cd to $root"
base=${FORK_BASE:-}
test -n "$base" || die "FORK_BASE is empty; run via make fork-canary or pass FORK_BASE=vX.Y.Z"
fork_sha=$(git rev-parse --verify "${CANARY_REF:-HEAD}^{commit}") || die "bad CANARY_REF"

remote=${UPSTREAM_REMOTE:-$(git remote -v | awk '$3 == "(fetch)" && $2 ~ /[:\/]stablyai\/orca(\.git)?$/ {print $1; exit}')}
test -n "$remote" || die "no remote points at stablyai/orca; pass UPSTREAM_REMOTE=<name>"
echo ">> fetching ${remote} main and tags"
git fetch --quiet --tags "$remote" "+refs/heads/main:refs/remotes/${remote}/main" || die "fetch from ${remote} failed"
upstream_sha=$(git rev-parse --verify "${CANARY_UPSTREAM_REF:-refs/remotes/${remote}/main}^{commit}") || die "bad upstream ref"
merge_base=$(git merge-base "$base" "$upstream_sha") || die "no merge-base between ${base} and upstream"
upstream_count=$(git rev-list --count "${merge_base}..${upstream_sha}")

wt=${CANARY_DIR:-$(dirname "$root")/orca-fork-canary}
# Why absolute: git worktree list prints absolute paths, so a relative override would never match.
mkdir -p "$(dirname "$wt")" || die "cannot create the parent of $wt"
wt="$(cd "$(dirname "$wt")" && pwd -P)/$(basename "$wt")"
report=${CANARY_REPORT:-$root/out/fork-canary-report.md}
logs="$(dirname "$report")/fork-canary"
mkdir -p "$logs" || die "cannot create $logs"
rm -f "$logs"/*

registered=$(git worktree list --porcelain | grep -qxF "worktree $wt" && echo 1)
if [ -e "$wt" ]; then
  # Why refuse an unregistered dir: removing it with rm could delete someone's work.
  test -n "$registered" || die "$wt exists and is not a git worktree; remove it or pass CANARY_DIR"
  echo ">> removing stale canary worktree $wt"
  git worktree remove --force "$wt" || die "cannot remove stale $wt"
elif [ -n "$registered" ]; then
  # Why not a bare prune: it would drop other sessions' worktree registrations too.
  git worktree remove --force "$wt" 2>/dev/null || git worktree prune
fi
cleanup() {
  if [ "${CANARY_KEEP:-}" = 1 ]; then
    echo ">> kept canary worktree $wt"
  else
    git -C "$root" worktree remove --force "$wt" >/dev/null 2>&1 || echo "fork-canary: could not remove $wt; run git worktree remove --force $wt" >&2
  fi
}
trap cleanup EXIT
git worktree add --quiet --detach "$wt" "$upstream_sha" || die "cannot create worktree $wt"

echo ">> merging fork $(git rev-parse --short "$fork_sha") into upstream $(git rev-parse --short "$upstream_sha")"
# Why rerere stays on: replaying recorded resolutions keeps old conflicts out of the report; nothing is committed, so no new resolution is recorded.
git -C "$wt" -c rerere.autoupdate=true -c user.name=fork-canary -c user.email=fork-canary@invalid \
  merge --no-ff --no-commit "$fork_sha" >"$logs/merge.log" 2>&1
merge_status=$?
conflicts=$(git -C "$wt" diff --name-only --diff-filter=U)
git -C "$wt" rev-parse -q --verify MERGE_HEAD >/dev/null || [ "$merge_status" -eq 0 ] || die "merge failed without conflicts; see $logs/merge.log"
replayed=$(sed -nE "s/^(Resolved|Staged) '(.*)' using previous resolution\.$/\2/p" "$logs/merge.log" | sort -u)

status=0
tc_failed=
install_failed=
tests_failed=
if [ -n "$conflicts" ]; then
  status=2
else
  echo ">> pnpm install"
  if ! (cd "$wt" && pnpm install --frozen-lockfile) >"$logs/install.log" 2>&1; then
    install_failed=1
    status=1
  else
    echo ">> pnpm tc"
    (cd "$wt" && pnpm tc) >"$logs/tc.log" 2>&1 || {
      tc_failed=1
      status=1
    }
    seams=$(cd "$wt" && node config/scripts/fork-seam-tests.mjs --existing 2>"$logs/seams-missing.log")
    changed=$(git diff --name-only --no-renames --diff-filter=AM "$base" "$fork_sha" -- '*.test.ts' '*.test.tsx' | grep -v '^tests/e2e/')
    tests=$(printf '%s\n' $seams $changed | sort -u | while read -r f; do test -n "$f" && test -f "$wt/$f" && echo "$f"; done)
    echo ">> vitest on $(printf '%s\n' $tests | grep -c .) files"
    # Why the guard: vitest with no file filter runs the whole suite.
    test -n "$tests" || die "no test files selected"
    (cd "$wt" && node config/scripts/ensure-native-runtime.mjs --runtime=node &&
      pnpm exec vitest run --config config/vitest.config.ts --reporter=default --reporter=json \
        --outputFile.json="$logs/vitest.json" $tests) >"$logs/vitest.log" 2>&1 || {
      tests_failed=1
      status=1
    }
  fi
fi

list_commits() {
  local out
  out=$(git log --format='%h %s' "$1" -- "$2")
  printf '%s\n' "$out" | head -n 15 | sed 's/^/    - /'
  local n
  n=$(printf '%s\n' "$out" | grep -c .)
  [ "$n" -gt 15 ] && echo "    - ... $((n - 15)) more"
}

{
  echo "# Fork canary report"
  echo
  echo "- Fork: \`$(git rev-parse --short "$fork_sha")\` on \`$base\`"
  echo "- Upstream: \`$(git rev-parse --short "$upstream_sha")\` (${CANARY_UPSTREAM_REF:-${remote}/main}), $upstream_count commits past the merge-base \`$(git rev-parse --short "$merge_base")\` with \`$base\`"
  case $status in
    0) echo "- Result: green (exit 0)" ;;
    1) echo "- Result: failures (exit 1)" ;;
    2) echo "- Result: merge conflicts (exit 2); typecheck and tests not run" ;;
  esac
  if [ -n "$replayed" ]; then
    echo
    echo "## Resolved by rerere"
    echo
    printf '%s\n' "$replayed" | sed 's/^/- `/; s/$/`/'
  fi
  if [ -n "$conflicts" ]; then
    echo
    echo "## Conflicts ($(printf '%s\n' "$conflicts" | grep -c .))"
    for f in $conflicts; do
      echo
      echo "- \`$f\`"
      echo "  - upstream:"
      list_commits "${merge_base}..${upstream_sha}" "$f"
      echo "  - fork:"
      list_commits "${base}..${fork_sha}" "$f"
    done
  fi
  if [ -n "$install_failed" ]; then
    echo
    echo "## pnpm install failed"
    echo
    echo '```'
    tail -n 30 "$logs/install.log"
    echo '```'
  fi
  if [ -n "$tc_failed" ]; then
    echo
    echo "## Typecheck errors"
    echo
    errors=$(grep -E '^[^ ]+\([0-9]+,[0-9]+\): error TS[0-9]+' "$logs/tc.log" | sort -u)
    if [ -n "$errors" ]; then
      printf '%s\n' "$errors" | sed -E 's/\(([0-9]+),[0-9]+\): error (TS[0-9]+): (.*)/	\1 \2 \3/' |
        awk -F'\t' '$1 != last {print "- `" $1 "`"; last = $1} {print "  - " $2}'
    else
      echo '```'
      tail -n 30 "$logs/tc.log"
      echo '```'
    fi
  fi
  if [ -s "$logs/seams-missing.log" ]; then
    echo
    echo "## Seam tests missing in the merged tree"
    echo
    sed 's/^fork-seam-tests: /- /' "$logs/seams-missing.log"
  fi
  if [ -n "$tests_failed" ]; then
    echo
    echo "## Failing tests"
    echo
    if [ -s "$logs/vitest.json" ]; then
      node -e '
        const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))
        const root = process.argv[2] + "/"
        for (const file of r.testResults) {
          const failed = file.assertionResults.filter((t) => t.status === "failed")
          if (file.status !== "failed" && failed.length === 0) continue
          console.log("- `" + file.name.replace(root, "") + "`")
          for (const t of failed) console.log("  - " + t.fullName)
          if (failed.length === 0) console.log("  - " + (file.message || "suite failed").split("\n")[0])
        }' "$logs/vitest.json" "$wt"
    else
      echo '```'
      tail -n 30 "$logs/vitest.log"
      echo '```'
    fi
  fi
  echo
  echo "Logs: \`$logs\`"
} >"$report"

echo ">> report: $report"
exit $status
