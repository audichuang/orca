#!/usr/bin/env bash
# Fork-only: run a heavy command (typecheck, fork-check*, vitest, e2e, canary checks, scans) for this checkout on
# the ubuntu SSH host, so the macmini keeps its CPU, memory and disk for UI work.
# Usage: fork-remote.sh [--pull <path>]... [--rm] [--] <command run by bash from the checkout root>
#   fork-remote.sh make fork-check
#   fork-remote.sh --pull out/scan 'node config/scripts/fork-hunk-guard-scan.mjs v1.4.258 --out out/scan'
# The host runs this checkout's working tree: HEAD is the same commit as here and uncommitted or untracked files
# (minus untracked top-level dot directories such as .orca) are staged on top, so `HEAD` in a command means what
# it means here. Nothing here changes: not the index, HEAD or files.
# Why git, not rsync: the checks need history and upstream tags (FORK_BASE, vitest --changed, the quality gate).
# The host keeps one worktree per local checkout with its node_modules (pnpm install reruns when pnpm-lock.yaml
# changes) and runs with LC_ALL=C, ORCA_BACKGROUND_LAUNCH=1, VITEST_MAX_WORKERS=3, an Xvfb display, and $FORK_REMOTE_SCRATCH, an empty
# directory outside the worktree deleted after the run. Runs from one checkout queue; a dropped SSH session
# neither stops the run nor loses its output.
# --pull copies a path inside the checkout back after the run, whatever its exit code; --rm deletes the host
# worktree after. Host worktrees idle for 3 days and run directories older than 7 days are deleted.
# Env: FORK_REMOTE_HOST (default ubuntu), FORK_REMOTE_DIR (default build/orca-remote, under the host's HOME).
# Exit: the command's exit code; 90 nothing ran (host unreachable or setup failed before the start);
#       91 the run started but its result is unknown (it died, or the host stayed unreachable for 10 minutes).
set -uo pipefail

host=${FORK_REMOTE_HOST:-ubuntu}
base_dir=${FORK_REMOTE_DIR:-build/orca-remote}
pulls=()
remove_after=0
while [ $# -gt 0 ]; do
  case "$1" in
    --pull) [ $# -ge 2 ] || { echo "fork-remote: --pull needs a path" >&2; exit 2; }; pulls+=("$2"); shift 2 ;;
    --rm) remove_after=1; shift ;;
    --) shift; break ;;
    *) break ;;
  esac
done
[ $# -gt 0 ] || { sed -n '4,6p' "$0" >&2; exit 2; }
cmd="$*"
run=

setup_fail() {
  echo "fork-remote: $* (nothing ran on $host)" >&2
  exit 90
}
unknown() {
  echo "fork-remote: $*; the result is unknown (log $host:~/$run/log)" >&2
  exit 91
}

root=$(git rev-parse --show-toplevel) || setup_fail "not in a git checkout"
cd "$root" || setup_fail "cannot cd to $root"
for p in "${pulls[@]+"${pulls[@]}"}"; do
  case "$p" in /*|*..*|'') setup_fail "--pull takes a path inside the checkout, not '$p'" ;; esac
done

ssh_opts=(-o BatchMode=yes -o ConnectTimeout=10 -o ServerAliveInterval=15 -o ServerAliveCountMax=4)
rsh() { ssh "${ssh_opts[@]}" "$host" "$@"; }
# ssh joins its arguments into one line for the host's shell (bash), so quote each one for it.
rsh_script() {
  local script=$1
  shift
  rsh "bash -s -- $(printf '%q ' "$@")" <<<"$script"
}
rsh true || setup_fail "cannot reach $host over ssh"

# Snapshot the working tree through a scratch index, so the real index and HEAD stay as they are.
idx=$(mktemp "${TMPDIR:-/tmp}/fork-remote-index.XXXXXX") || setup_fail "mktemp failed"
trap 'rm -f "$idx"' EXIT
cp "$(git rev-parse --git-path index)" "$idx" 2>/dev/null || :
excludes=()
while IFS= read -r d; do
  excludes+=(":(exclude)${d%/}")
done < <(git ls-files -o --exclude-standard --directory | grep -E '^\.[^/]+/$')
GIT_INDEX_FILE=$idx git add -A -- . "${excludes[@]+"${excludes[@]}"}" || setup_fail "cannot snapshot the working tree"
tree=$(GIT_INDEX_FILE=$idx git write-tree) || setup_fail "cannot write the snapshot tree"
head=$(git rev-parse HEAD) || setup_fail "no HEAD"
if [ "$tree" = "$(git rev-parse "HEAD^{tree}")" ]; then
  sha=$head
else
  sha=$(git commit-tree "$tree" -p "$head" -m "fork-remote snapshot of $root") || setup_fail "cannot write the snapshot commit"
fi

slug="$(basename "$root")-$(printf '%s' "$root" | shasum | cut -c1-8)"
run_id="$slug-$(date -u +%Y%m%dT%H%M%SZ)-$$"
repo="$base_dir/repo.git"
wt="$base_dir/wt/$slug"
run="$base_dir/runs/$run_id"
ref="refs/fork-remote/$run_id"

# One clone from GitHub on first use, so later pushes send only the snapshot's new objects.
# Why the lock: parallel runs (the auto-rebase starts several) would collide on the clone and on ref updates.
prepare=$(cat <<'EOF'
set -e
repo=$HOME/$1
mkdir -p "$(dirname "$repo")"
exec 7>"$repo.lock"
flock 7
if [ ! -d "$repo" ]; then
  rm -rf "$repo.tmp"
  git clone -q --bare https://github.com/audichuang/orca.git "$repo.tmp"
  git -C "$repo.tmp" remote rename origin fork
  git -C "$repo.tmp" remote add origin https://github.com/stablyai/orca.git
  mv "$repo.tmp" "$repo"
fi
git -C "$repo" fetch -q --prune fork '+refs/heads/*:refs/remotes/fork/*'
git -C "$repo" fetch -q --tags origin '+refs/heads/main:refs/remotes/origin/main'
EOF
)
rsh_script "$prepare" "$repo" || setup_fail "cannot prepare $repo on $host"
git push -q "$host:$repo" "+$sha:$ref" || setup_fail "cannot push the snapshot to $host"
# Why: the canary and rebases replay this clone's recorded resolutions; without them the host reports solved conflicts.
rr=$(git rev-parse --git-common-dir)/rr-cache
if [ -d "$rr" ]; then
  rsync -a -e "ssh ${ssh_opts[*]}" "$rr/" "$host:$repo/rr-cache/" || setup_fail "cannot copy rr-cache to $host"
fi

# Same tag set as here or the host's FORK_BASE (and the tests it selects) would differ.
want_base=$(git describe --tags --abbrev=0 --match 'v[0-9]*' --exclude '*fork*' HEAD 2>/dev/null)
got_base=$(rsh git -C "$repo" describe --tags --abbrev=0 --match "'v[0-9]*'" --exclude "'*fork*'" "$head" 2>/dev/null)
[ "$want_base" = "$got_base" ] || setup_fail "fork base differs: here '$want_base', $host '$got_base'"

# The supervisor owns the whole run under the worktree lock: checkout, install, command, copying --pull paths
# into the run directory, --rm, and writing the exit file last. It holds the run's alive lock until it ends.
supervisor=$(cat <<'EOF'
repo=$HOME/$1 wt=$HOME/$2 run=$HOME/$3 sha=$4 head=$5 ref=$6 remove_after=$7 cmd=$8
shift 8
exec 8>"$run/alive"
flock 8
: >"$run/started"
# A run whose supervisor and follower both died: its leftovers may hold a worktree lock or a slot.
# Why while waiting, not once: a run can die after this one started waiting, and nothing else would clean it up.
reap_stale() {
  local old
  for old in "${run%/*}"/*/; do
    old=${old%/}
    [ "$old" != "$run" ] && [ -e "$old/started" ] && [ ! -s "$old/exit" ] && [ -s "$old/unit" ] || continue
    flock -n "$old/alive" true && systemctl --user stop "$(cat "$old/unit")" 2>/dev/null || :
  done
}
exec 9>"$wt.lock"
until flock -n 9; do
  [ -n "${wt_note:-}" ] || { echo ">> waiting for another run from this checkout"; wt_note=1; }
  reap_stale
  sleep 5
done
# Why two slots: the auto-rebase starts four or five runs at once; more than two whole-suite runs push the host into swap.
slot=
while [ -z "$slot" ]; do
  for n in 1 2; do
    exec 7>"${run%/runs/*}/slot.$n.lock"
    if flock -n 7; then slot=$n; break; fi
    exec 7>&-
  done
  if [ -z "$slot" ]; then
    [ -n "${slot_note:-}" ] || { echo ">> waiting for a free run slot (2 runs at a time on this host)"; slot_note=1; }
    reap_stale
    sleep 5
  fi
done
started_at=$(date +%s)
slice_events=/sys/fs/cgroup$(sed -n 's/^0:://p' /proc/self/cgroup | sed 's#/[^/]*$##')/memory.events
read_events() { awk '$1 == "high" || $1 == "oom_kill" {printf "%s=%s ", $1, $2}' "$slice_events" 2>/dev/null; }
events_before=$(read_events)
code=
# Why a child bash: set -e is ignored inside an if condition, so a failed install would still run the command.
setup='set -euo pipefail
repo=$1 wt=$2 sha=$3 head=$4
if [ -e "$wt/.git" ]; then
  git -C "$wt" checkout -q -f --detach "$sha"
  git -C "$wt" clean -fdq
else
  rm -rf "$wt"
  git -C "$repo" worktree add -q --detach "$wt" "$sha"
fi
# Why: HEAD equals the local HEAD and the local edits sit staged on it, so HEAD in a command keeps its meaning.
git -C "$wt" reset -q --soft "$head"
cd "$wt"
# Why: fork-check-mobile installs it, and its presence pulls the mobile browser tests into later unit runs, which CI skips.
rm -rf mobile/node_modules
lock_hash=$(sha256sum pnpm-lock.yaml | cut -c1-64)
# Why inside node_modules: git clean would delete an untracked stamp, and a wiped node_modules must reinstall.
if [ "$(cat node_modules/.fork-remote-lock 2>/dev/null)" != "$lock_hash" ]; then
  rm -f node_modules/.fork-remote-lock
  echo ">> pnpm install --frozen-lockfile"
  HUSKY=0 pnpm install --frozen-lockfile
  echo "$lock_hash" >node_modules/.fork-remote-lock
fi'
if bash -c "$setup" _ "$repo" "$wt" "$sha" "$head" 8>&-; then
  mkdir -p "$run/scratch"
  export LC_ALL=C ORCA_BACKGROUND_LAUNCH=1 HUSKY=0 FORK_REMOTE_SCRATCH="$run/scratch"
  # Why: vitest defaults to one worker per core (20 here), and each worker of the shared (isolate: false) project caches
  # most of the module graph, about 3G; 5 workers still peaked at 21G, 3 stay near 11G.
  export VITEST_MAX_WORKERS=${VITEST_MAX_WORKERS:-3}
  echo ">> $cmd"
  # Why close 8: a leftover holding it would make a dead supervisor look alive.
  (cd "$wt" && xvfb-run -a -s '-screen 0 1920x1080x24' bash -c "$cmd") 8>&-
  code=$?
  # Leftovers, detached ones included, share this run's cgroup (systemd scope); end them before the lock is released.
  procs=/sys/fs/cgroup$(sed -n 's/^0:://p' /proc/self/cgroup)/cgroup.procs
  for sig in TERM TERM KILL KILL; do
    others=$(grep -vx "$$" "$procs" 2>/dev/null | grep -vx "$BASHPID")
    [ -n "$others" ] || break
    kill -"$sig" $others 2>/dev/null
    sleep 2
  done
  rm -rf "$run/scratch"
  git -C "$repo" worktree prune
else
  echo ">> fork-remote: checkout or install failed; the command did not run"
  code=90
fi
mkdir -p "$run/pulled"
for p in "$@"; do
  (cd "$wt" && [ -e "$p" ] && cp -a --parents "$p" "$run/pulled/") || echo ">> fork-remote: nothing at $p to pull"
done
if [ "$remove_after" = 1 ]; then
  git -C "$repo" worktree remove --force "$wt" 2>/dev/null || rm -rf "$wt"
  git -C "$repo" worktree prune
  rm -f "$wt.used"
fi
git -C "$repo" update-ref -d "$ref" || :
peak=$(cat "/sys/fs/cgroup$(sed -n 's/^0:://p' /proc/self/cgroup)/memory.peak" 2>/dev/null || echo 0)
echo ">> fork-remote: peak memory $((peak / 1048576)) MB, $(( $(date +%s) - started_at )) s on $(hostname)"
events_after=$(read_events)
# Why: a run held at the slice's memory cap times out tests, which reads like a regression.
[ "$events_after" = "$events_before" ] ||
  echo ">> fork-remote: WARNING the host's run slice hit its memory cap during this run ($events_before-> $events_after); read timeouts as memory pressure first"
echo "$code" >"$run/exit"
EOF
)

start=$(cat <<'EOF'
set -e
base=$HOME/$1 wt=$HOME/$3 run=$HOME/$4
mkdir -p "$base/wt" "$base/runs" "$run"
# Idle worktrees cost GBs of node_modules each; one in use holds its lock. The lock file stays: a waiter may hold it.
find "$base/wt" -maxdepth 1 -name '*.used' -mtime +3 2>/dev/null | while read -r used; do
  old=${used%.used}
  flock -n "$old.lock" sh -c 'git -C "$1" worktree remove --force "$2" 2>/dev/null || rm -rf "$2"; rm -f "$3"' \
    _ "$base/repo.git" "$old" "$used" || :
done
git -C "$base/repo.git" worktree prune
find "$base/runs" -mindepth 1 -maxdepth 1 -type d -mtime +7 -exec rm -rf {} + 2>/dev/null || :
systemctl --user reset-failed 'fork-remote-*' 2>/dev/null || :
# A run whose supervisor died with no follower left: its leftovers may hold a worktree lock or a slot. Why here and
# not after the locks: a run waiting behind those locks would never get to clean them.
for old in "$base"/runs/*/; do
  old=${old%/}
  [ -e "$old/started" ] && [ ! -s "$old/exit" ] && [ -s "$old/unit" ] || continue
  flock -n "$old/alive" true && systemctl --user stop "$(cat "$old/unit")" 2>/dev/null || :
done
touch "$wt.used"
printf '%s' "$2" >"$run/supervisor.sh"
shift 4
# Why a scope: its cgroup holds every process the run starts, detached ones included, so they can be ended together.
# Why --expand-environment=no: systemd-run would otherwise expand ${...} in the command before bash sees it.
unit="fork-remote-${run##*/}.scope"
printf '%s' "$unit" >"$run/unit"
# Why its own slice: the user's app.slice caps GUI apps at 20G, and a test run there throttles the desktop and
# itself. These caps keep runaway runs from taking the host (61G) with them or swapping it to a halt, and the
# weights let the desktop and the host's other CI work go first.
systemctl --user set-property --runtime orcaremote.slice MemoryHigh=24G MemoryMax=28G MemorySwapMax=2G CPUWeight=50 IOWeight=50
setsid nohup systemd-run --user --scope --quiet --expand-environment=no --slice=orcaremote.slice --unit="$unit" bash "$run/supervisor.sh" "$@" </dev/null >"$run/log" 2>&1 &
for _ in $(seq 60); do
  [ -e "$run/started" ] && exit 0
  sleep 0.5
done
echo "fork-remote: the supervisor did not start" >&2
exit 1
EOF
)

echo ">> fork-remote: $host:~/$wt at ${sha:0:10} (HEAD ${head:0:10}, fork base $want_base); log $host:~/$run/log"
if ! rsh_script "$start" "$base_dir" "$supervisor" "$wt" "$run" \
  "$repo" "$wt" "$run" "$sha" "$head" "$ref" "$remove_after" "$cmd" "${pulls[@]+"${pulls[@]}"}"; then
  # Why probe: SSH can drop after the supervisor started; returning 90 would make callers run it a second time.
  state=$(rsh "test -e ~/'$run/started' && echo started || echo absent" 2>/dev/null) || unknown "lost $host while starting the run"
  [ "$state" = started ] || setup_fail "could not start the run"
fi

# Stream the log from a byte offset until the exit file appears; the alive lock tells a dead run from a slow one.
follow=$(cat <<'EOF'
run=$HOME/$1 offset=$2
tail -c +"$offset" -F "$run/log" 2>/dev/null &
t=$!
while [ ! -s "$run/exit" ]; do
  if flock -n "$run/alive" true; then
    sleep 1
    [ -s "$run/exit" ] && break
    kill "$t"
    # The supervisor is gone but what it started may not be: stop its scope so a retry cannot meet it.
    systemctl --user stop "$(cat "$run/unit")" 2>/dev/null
    exit 3
  fi
  sleep 2
done
sleep 1
kill "$t"
EOF
)
exec 3>&1
status_file=$(mktemp "${TMPDIR:-/tmp}/fork-remote-status.XXXXXX") || unknown "mktemp failed"
trap 'rm -f "$idx" "$status_file"' EXIT
shown=0
lost_since=
while :; do
  n=$({ rsh_script "$follow" "$run" "$((shown + 1))"; echo $? >"$status_file"; } | tee /dev/fd/3 | wc -c)
  shown=$((shown + n))
  [ "$(cat "$status_file")" != 3 ] || unknown "the run on $host died before writing its exit code"
  [ "$n" -eq 0 ] || lost_since=
  code=$(rsh cat "'$run/exit'" 2>/dev/null) && [ -n "$code" ] && break
  : "${lost_since:=$SECONDS}"
  [ $((SECONDS - lost_since)) -lt 600 ] || unknown "$host has been unreachable for 10 minutes"
  echo "fork-remote: lost $host, reconnecting" >&2
  sleep 10
done

for p in "${pulls[@]+"${pulls[@]}"}"; do
  rsync -aR -e "ssh ${ssh_opts[*]}" "$host:$run/pulled/./$p" "$root/" 2>/dev/null || echo "fork-remote: could not pull $p" >&2
done
echo ">> fork-remote: exit $code"
exit "$code"
