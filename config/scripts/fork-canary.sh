#!/usr/bin/env bash
# Fork canary: merge the fork into upstream main in a throwaway worktree, then typecheck and run the fork's tests.
# Report-only early warning before the next release tag; never a gate. Never pushes or touches the invoking checkout.
# Shared side effects: the fetch updates remote refs and tags, and rerere writes preimages to the common git dir.
# Conflicted files are reset to upstream's side so typecheck and tests still run; the report marks them.
# Exit: 0 green; 1 not green (conflicts and/or failures, the report's Result line says which); 3 setup error.
# Env: FORK_BASE and UPSTREAM_REMOTE (both set by make fork-canary), CANARY_REF (fork side, default HEAD),
#      CANARY_UPSTREAM_REF (default <upstream>/main), CANARY_DIR (must not exist; default a fresh ../orca-fork-canary.XXXXXX),
#      CANARY_REPORT (logs go to <report>.logs), CANARY_KEEP=1.
set -uo pipefail
export LC_ALL=C ORCA_BACKGROUND_LAUNCH=1

report=
tmp_report=
logs=
tmp_logs=
wt=
wt_created=

# Why temp then mv: a concurrent run, or a reader, never sees a half-written report or a mix of two runs' logs.
publish() {
  [ -z "$tmp_logs" ] || { rm -rf "$logs" && mv "$tmp_logs" "$logs" && tmp_logs=; }
  mv "$tmp_report" "$report"
}

# Why a report on every setup error: a stale green report must never outlive a failed run.
die() {
  echo "fork-canary: $*" >&2
  if [ -n "$tmp_report" ]; then
    printf '# Fork canary report\n\n- Result: setup error (exit 3): %s\n' "$*" >"$tmp_report" && publish
  fi
  exit 3
}

cleanup() {
  if [ -n "$wt_created" ]; then
    if [ "${CANARY_KEEP:-}" = 1 ]; then
      echo ">> kept canary worktree $wt (the next run removes it)"
    else
      git -C "$root" worktree remove --force "$wt" >/dev/null 2>&1 || echo "fork-canary: could not remove $wt; run git worktree remove --force $wt" >&2
    fi
  fi
  [ -z "$tmp_logs" ] || rm -rf "$tmp_logs"
  [ -z "$tmp_report" ] || rm -f "$tmp_report"
}
trap cleanup EXIT

root=$(git rev-parse --show-toplevel) || die "not in a git checkout"
cd "$root" || die "cannot cd to $root"
common="$(cd "$(git rev-parse --git-common-dir)" && pwd -P)" || die "cannot resolve the common git dir"

report=${CANARY_REPORT:-$root/out/fork-canary-report.md}
mkdir -p "$(dirname "$report")" || die "cannot create the directory of $report"
tmp_report=$(mktemp "$report.XXXXXX") || die "cannot create a temp report next to $report"
rm -f "$report"
logs="${report%.md}.logs"
tmp_logs=$(mktemp -d "$logs.XXXXXX") || die "cannot create a logs dir next to $report"

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

# Why only marked worktrees of dead runs: anything else may be someone's work or a canary still running.
for marker in "$common"/worktrees/*/fork-canary-owner; do
  [ -f "$marker" ] || continue
  owner=$(cat "$marker")
  ps -p "$owner" >/dev/null 2>&1 && continue
  stale=$(dirname "$(cat "$(dirname "$marker")/gitdir")")
  echo ">> removing stale canary worktree $stale (pid $owner gone)"
  git worktree remove --force "$stale" || echo "fork-canary: could not remove $stale" >&2
done

# Why a fresh directory per run: concurrent canaries then never share a tree, so no lock is needed.
if [ -n "${CANARY_DIR:-}" ]; then
  wt=$CANARY_DIR
  [ ! -e "$wt" ] && [ ! -L "$wt" ] || die "CANARY_DIR $wt already exists; pass a path that does not"
  mkdir -p "$(dirname "$wt")" || die "cannot create the parent of $wt"
  wt="$(cd "$(dirname "$wt")" && pwd -P)/$(basename "$wt")"
  case "$wt/" in "$root/"*) die "CANARY_DIR $wt is inside the invoking checkout" ;; esac
else
  wt=$(mktemp -d "$(dirname "$root")/orca-fork-canary.XXXXXX") || die "cannot create a canary directory"
fi
git worktree add --quiet --detach "$wt" "$upstream_sha" || die "cannot create worktree $wt"
wt_created=1
echo $$ >"$(git -C "$wt" rev-parse --absolute-git-dir)/fork-canary-owner" || die "cannot mark $wt as the canary's"

echo ">> merging fork $(git rev-parse --short "$fork_sha") into upstream $(git rev-parse --short "$upstream_sha")"
# Why rerere on: replaying recorded resolutions keeps old conflicts out of the report; nothing is committed, so no new resolution is recorded.
git -C "$wt" -c rerere.enabled=true -c rerere.autoupdate=true -c user.name=fork-canary -c user.email=fork-canary@invalid \
  merge --no-ff --no-commit "$fork_sha" >"$tmp_logs/merge.log" 2>&1
merge_status=$?
conflicts=$(git -C "$wt" diff --name-only --diff-filter=U)
git -C "$wt" rev-parse -q --verify MERGE_HEAD >/dev/null || [ "$merge_status" -eq 0 ] || die "merge failed without conflicts; see $tmp_logs/merge.log"
replayed=$(sed -nE "s/^(Resolved|Staged) '(.*)' using previous resolution\.$/\2/p" "$tmp_logs/merge.log" | sort -u)
n_conflicts=$(printf '%s\n' "$conflicts" | grep -c .)

# Why upstream's side: upstream conflicts most days, and stopping here would leave the canary testing almost nothing.
while IFS= read -r f; do
  [ -n "$f" ] || continue
  if git -C "$wt" cat-file -e "HEAD:$f" 2>/dev/null; then
    git -C "$wt" checkout HEAD -- "$f" || die "cannot take upstream's side of $f"
  else
    git -C "$wt" rm -q -f -- "$f" || die "cannot take upstream's deletion of $f"
  fi
done <<<"$conflicts"

install_failed=
install_note=
tc_failed=
listing_failed=
dropped=
tests_failed=
# Why HUSKY=0: husky's prepare script would write hooksPath into the shared .git/config.
pnpm_install() {
  (cd "$wt" && HUSKY=0 pnpm install "$1") >>"$tmp_logs/install.log" 2>&1
}
echo ">> pnpm install"
if printf '%s\n' "$conflicts" | grep -qxE 'pnpm-lock\.yaml|package\.json'; then
  install_note="the lockfile or package.json conflicted, so install ran with --no-frozen-lockfile"
  pnpm_install --no-frozen-lockfile || install_failed=1
elif ! pnpm_install --frozen-lockfile; then
  install_note="install --frozen-lockfile failed (lockfile drift), so it was retried with --no-frozen-lockfile"
  pnpm_install --no-frozen-lockfile || install_failed=1
fi
if [ -z "$install_failed" ]; then
  echo ">> pnpm tc"
  (cd "$wt" && pnpm tc) >"$tmp_logs/tc.log" 2>&1 || tc_failed=1
  (cd "$wt" && node config/scripts/fork-test-inventory.mjs list --existing >/dev/null 2>"$tmp_logs/seam-list.log")
  # Why the merged tree's script: it collects with the merged tree's runner config and skips files the merge removed.
  if ! tests=$(cd "$wt" && node config/scripts/fork-test-inventory.mjs fork-changed "$base" "$fork_sha" 2>"$tmp_logs/listing.log") ||
    ! dropped=$(cd "$wt" && node config/scripts/fork-test-inventory.mjs fork-dropped "$base" "$fork_sha" 2>>"$tmp_logs/listing.log"); then
    listing_failed=1
  elif [ -z "$tests" ]; then
    # Why: vitest with no file filter runs the whole suite.
    echo "no fork test selected" >"$tmp_logs/listing.log"
    listing_failed=1
  else
    echo ">> vitest on $(printf '%s\n' "$tests" | grep -c .) files"
    # Why unquoted: each path is one argument; repo paths contain no whitespace.
    (cd "$wt" && node config/scripts/ensure-native-runtime.mjs --runtime=node &&
      pnpm exec vitest run --config config/vitest.config.ts --reporter=default --reporter=json \
        --outputFile.json="$tmp_logs/vitest.json" $tests) >"$tmp_logs/vitest.log" 2>&1 || tests_failed=1
  fi
fi

findings=
[ -z "$conflicts" ] || findings="$findings, $n_conflicts merge conflicts"
[ -z "$install_failed" ] || findings="$findings, pnpm install failed"
[ -z "$tc_failed" ] || findings="$findings, typecheck errors"
[ -z "$listing_failed" ] || findings="$findings, test listing failed in the merged tree"
[ -z "$tests_failed" ] || findings="$findings, failing tests"
[ -z "$dropped" ] || findings="$findings, fork tests the merged tree no longer runs"
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
  [ -z "$install_note" ] || echo "- Install: $install_note"
  if [ -n "$replayed" ]; then
    echo
    echo "## Resolved by rerere"
    echo
    printf '%s\n' "$replayed" | sed 's/^/- `/; s/$/`/'
  fi
  if [ -n "$conflicts" ]; then
    echo
    echo "## Conflicts ($n_conflicts)"
    while IFS= read -r f; do
      echo
      echo "- \`$f\`"
      echo "  - upstream:"
      list_commits "${merge_base}..${upstream_sha}" "$f"
      echo "  - fork:"
      list_commits "${base}..${fork_sha}" "$f"
    done <<<"$conflicts"
  fi
  if [ -n "$conflicts" ] && { [ -n "$tc_failed" ] || [ -n "$tests_failed" ]; }; then
    echo
    echo "Conflicted files were reset to upstream; failures in them or their dependents may come from that, or may be real."
  fi
  if [ -n "$install_failed" ]; then
    echo
    echo "## pnpm install failed"
    echo
    log_tail "$tmp_logs/install.log"
  fi
  if [ -n "$tc_failed" ]; then
    echo
    echo "## Typecheck errors"
    echo
    errors=$(grep -E '^[^ ]+\([0-9]+,[0-9]+\): error TS[0-9]+' "$tmp_logs/tc.log" | sort -u)
    if [ -n "$errors" ]; then
      printf '%s\n' "$errors" | sed -E 's/\([0-9]+,[0-9]+\): error .*//' | uniq | while IFS= read -r file; do
        echo "- \`$file\`$(conflict_note "$file")"
        printf '%s\n' "$errors" | grep -F "$file(" | sed -E 's/^[^ ]+\(([0-9]+),[0-9]+\): error (TS[0-9]+): (.*)/  - \1 \2 \3/'
      done
    else
      log_tail "$tmp_logs/tc.log"
    fi
  fi
  if [ -s "$tmp_logs/seam-list.log" ]; then
    echo
    echo "## Seam list problems in the merged tree"
    echo
    sed 's/^fork-test-inventory: /- /' "$tmp_logs/seam-list.log"
  fi
  if [ -n "$listing_failed" ]; then
    echo
    echo "## Test listing failed in the merged tree"
    echo
    log_tail "$tmp_logs/listing.log"
  fi
  if [ -n "$dropped" ]; then
    echo
    echo "## Fork tests the merged tree no longer runs"
    echo
    printf '%s\n' "$dropped" | while IFS=$'\t' read -r reason path; do echo "- \`$path\`: $reason"; done
  fi
  if [ -n "$tests_failed" ]; then
    echo
    echo "## Failing tests"
    echo
    if [ -s "$tmp_logs/vitest.json" ]; then
      node -e '
        const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))
        const root = process.argv[2] + "/"
        for (const file of r.testResults) {
          const failed = file.assertionResults.filter((t) => t.status === "failed")
          if (file.status !== "failed" && failed.length === 0) continue
          console.log("FILE\t" + file.name.replace(root, ""))
          for (const t of failed) console.log("TEST\t" + t.fullName)
          if (failed.length === 0) console.log("TEST\t" + (file.message || "suite failed").split("\n")[0])
        }' "$tmp_logs/vitest.json" "$wt" | while IFS=$'\t' read -r kind text; do
        if [ "$kind" = FILE ]; then
          echo "- \`$text\`$(conflict_note "$text")"
        else
          echo "  - $text"
        fi
      done
    else
      log_tail "$tmp_logs/vitest.log"
    fi
  fi
  echo
  echo "Logs: \`$logs\`"
} >"$tmp_report"
publish

echo ">> report: $report (exit $status)"
exit $status
