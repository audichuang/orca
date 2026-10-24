#!/usr/bin/env bash
# Fork canary: merge the fork into upstream main in a throwaway worktree, then typecheck and run the fork's tests.
# Report-only early warning before the next release tag; never a gate. Never pushes or touches the invoking checkout.
# Conflicted files are reset to upstream's side so typecheck and tests still run; the report marks them.
# Exit: 0 green; 1 not green (conflicts and/or failures, the report's Result line says which); 3 setup error.
# Env: FORK_BASE and UPSTREAM_REMOTE (both set by make fork-canary), CANARY_REF (fork side, default HEAD),
#      CANARY_UPSTREAM_REF (default <upstream>/main), CANARY_DIR (default ../orca-fork-canary), CANARY_REPORT, CANARY_KEEP=1.
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
remote=${UPSTREAM_REMOTE:-}
test -n "$remote" || die "UPSTREAM_REMOTE is empty; run via make fork-canary or pass UPSTREAM_REMOTE=<name>"
fork_sha=$(git rev-parse --verify "${CANARY_REF:-HEAD}^{commit}") || die "bad CANARY_REF"

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

if git worktree list --porcelain | grep -qxF "worktree $wt"; then
  echo ">> removing stale canary worktree $wt"
  git worktree remove --force "$wt" || die "cannot remove stale $wt"
elif [ -e "$wt" ]; then
  # Why refuse an unregistered dir: removing it with rm could delete someone's work.
  die "$wt exists and is not a git worktree; remove it or pass CANARY_DIR"
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
n_conflicts=$(printf '%s\n' $conflicts | grep -c .)

# Why upstream's side: upstream conflicts most days, and stopping here would leave the canary testing almost nothing.
for f in $conflicts; do
  if git -C "$wt" cat-file -e "HEAD:$f" 2>/dev/null; then
    git -C "$wt" checkout HEAD -- "$f" || die "cannot take upstream's side of $f"
  else
    git -C "$wt" rm -q -f -- "$f" || die "cannot take upstream's deletion of $f"
  fi
done

install_failed=
tc_failed=
tests_failed=
echo ">> pnpm install"
if ! (cd "$wt" && pnpm install --frozen-lockfile) >"$logs/install.log" 2>&1; then
  install_failed=1
else
  echo ">> pnpm tc"
  (cd "$wt" && pnpm tc) >"$logs/tc.log" 2>&1 || tc_failed=1
  (cd "$wt" && node config/scripts/fork-seam-tests.mjs --existing >/dev/null 2>"$logs/seams-missing.log")
  # Why the merged tree's script: it collects with the merged tree's runner config and skips files the merge removed.
  tests=$(cd "$wt" && node config/scripts/fork-seam-tests.mjs --fork-changed "$base" "$fork_sha") || die "cannot list the fork's tests"
  echo ">> vitest on $(printf '%s\n' $tests | grep -c .) files"
  # Why the guard: vitest with no file filter runs the whole suite.
  test -n "$tests" || die "no test files selected"
  (cd "$wt" && node config/scripts/ensure-native-runtime.mjs --runtime=node &&
    pnpm exec vitest run --config config/vitest.config.ts --reporter=default --reporter=json \
      --outputFile.json="$logs/vitest.json" $tests) >"$logs/vitest.log" 2>&1 || tests_failed=1
fi

findings=
[ -n "$conflicts" ] && findings="$findings, $n_conflicts merge conflicts"
[ -n "$install_failed" ] && findings="$findings, pnpm install failed"
[ -n "$tc_failed" ] && findings="$findings, typecheck errors"
[ -n "$tests_failed" ] && findings="$findings, failing tests"
status=$([ -z "$findings" ] && echo 0 || echo 1)

conflict_note() {
  printf '%s\n' "$conflicts" | grep -qxF "$1" && echo " (conflicted file)"
}

log_tail() {
  echo '```'
  tail -n 30 "$1"
  echo '```'
}

list_commits() {
  git log -n 15 --format='    - %h %s' "$1" -- "$2"
  local n
  n=$(git rev-list --count "$1" -- "$2")
  [ "$n" -le 15 ] || echo "    - ... $((n - 15)) more"
}

{
  echo "# Fork canary report"
  echo
  echo "- Fork: \`$(git rev-parse --short "$fork_sha")\` on \`$base\`"
  echo "- Upstream: \`$(git rev-parse --short "$upstream_sha")\` (${CANARY_UPSTREAM_REF:-${remote}/main}), $upstream_count commits past the merge-base \`$(git rev-parse --short "$merge_base")\` with \`$base\`"
  if [ -z "$findings" ]; then
    echo "- Result: green (exit 0)"
  else
    echo "- Result: not green (exit 1): ${findings#, }"
  fi
  if [ -n "$replayed" ]; then
    echo
    echo "## Resolved by rerere"
    echo
    printf '%s\n' "$replayed" | sed 's/^/- `/; s/$/`/'
  fi
  if [ -n "$conflicts" ]; then
    echo
    echo "## Conflicts ($n_conflicts)"
    for f in $conflicts; do
      echo
      echo "- \`$f\`"
      echo "  - upstream:"
      list_commits "${merge_base}..${upstream_sha}" "$f"
      echo "  - fork:"
      list_commits "${base}..${fork_sha}" "$f"
    done
  fi
  if [ -n "$conflicts" ] && { [ -n "$tc_failed" ] || [ -n "$tests_failed" ]; }; then
    echo
    echo "Conflicted files were reset to upstream; failures in them or their dependents may come from that, or may be real."
  fi
  if [ -n "$install_failed" ]; then
    echo
    echo "## pnpm install failed"
    echo
    log_tail "$logs/install.log"
  fi
  if [ -n "$tc_failed" ]; then
    echo
    echo "## Typecheck errors"
    echo
    errors=$(grep -E '^[^ ]+\([0-9]+,[0-9]+\): error TS[0-9]+' "$logs/tc.log" | sort -u)
    if [ -n "$errors" ]; then
      for file in $(printf '%s\n' "$errors" | sed -E 's/\([0-9]+,[0-9]+\): error .*//' | uniq); do
        echo "- \`$file\`$(conflict_note "$file")"
        printf '%s\n' "$errors" | grep -F "$file(" | sed -E 's/^[^ ]+\(([0-9]+),[0-9]+\): error (TS[0-9]+): (.*)/  - \1 \2 \3/'
      done
    else
      log_tail "$logs/tc.log"
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
          console.log("FILE\t" + file.name.replace(root, ""))
          for (const t of failed) console.log("TEST\t" + t.fullName)
          if (failed.length === 0) console.log("TEST\t" + (file.message || "suite failed").split("\n")[0])
        }' "$logs/vitest.json" "$wt" | while IFS=$'\t' read -r kind text; do
        if [ "$kind" = FILE ]; then
          echo "- \`$text\`$(conflict_note "$text")"
        else
          echo "  - $text"
        fi
      done
    else
      log_tail "$logs/vitest.log"
    fi
  fi
  echo
  echo "Logs: \`$logs\`"
} >"$report"

echo ">> report: $report (exit $status)"
exit $status
