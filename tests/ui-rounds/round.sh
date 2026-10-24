#!/bin/bash
# A hands-on UI round against a visible Orca Dev: start | stop | reset | status.
# The app runs from the checkout holding this script, so the cases and the UI under test share a commit.
# ORCA_UI_ROOT (default ~/orca-ui-test) holds the profile, the MultiProduct fixture and the clipboard log.
# ORCA_UI_OWNER names who holds the screen (a session name); the lock stops two rounds driving one screen.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
SRC=$(cd "$HERE/../.." && pwd)
OWNER="${ORCA_UI_OWNER:-}"
LOCK="$HOME/.cache/orca-ui-rounds/round.json"
mkdir -p "$(dirname "$LOCK")"

lock_field() { [ -f "$LOCK" ] && python3 -I -c 'import json,sys; print(json.load(open(sys.argv[1])).get(sys.argv[2], ""))' "$LOCK" "$1" || true; }
app_running() { pgrep -f "$1/out/electron-dev/" >/dev/null; }
kill_tree() { local c; for c in $(pgrep -P "$1" 2>/dev/null); do kill_tree "$c"; done; kill "$1" 2>/dev/null || true; }
# Another owner holds the screen while its app or its starting round.sh is alive
held_by_other() {
  local held pid; held=$(lock_field owner); pid=$(lock_field pid)
  [ -n "$held" ] && [ "$held" != "$OWNER" ] && { app_running "$(lock_field src)" || { [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; }; }
}
write_lock() {
  python3 -I - "$LOCK" "$OWNER" "$ROOT" "$SRC" "$@" <<'PY'
import json, sys, datetime
lock, owner, root, src, pid, app, cdp, commit = (sys.argv[1:] + [""] * 8)[:8]
json.dump({"owner": owner, "root": root, "src": src, "app": app, "cdp": cdp, "commit": commit, "pid": int(pid),
           "startedAt": datetime.datetime.now().isoformat(timespec="seconds")}, open(lock, "w"), indent=1)
PY
}
# One holder at a time for check-then-act on the lock (start's reservation, stop, kill): an flock on fd 9, which
# the OS drops when the holder exits, so a crash at any point cannot wedge later rounds.
mutex_acquire() {
  exec 9>"$LOCK.flock"
  perl -MFcntl=:flock -e 'open(my $f, ">&=9") or die "round: fd 9: $!"; flock($f, LOCK_EX) or die "round: flock: $!"'
}
mutex_release() { exec 9>&-; }
# Ends a round's processes by its lock pid and checkout path (the installed Orca and other checkouts share the bundle id)
end_app() {
  local sig=$1 pid=$2 src=$3
  # The app first: with -KILL it must not get the orderly quit its launcher's TERM would cause
  pkill "$sig" -f "$src/out/electron-dev/" 2>/dev/null || true
  [ -n "$pid" ] && kill_tree "$pid"
  for _ in $(seq 1 15); do app_running "$src" || break; sleep 1; done
  ! app_running "$src"
}
# The active round's root unless one is named, so pre scripts and reset touch the fixture the cases read
ROOT="${ORCA_UI_ROOT:-$(lock_field root)}"
ROOT="${ROOT:-$HOME/orca-ui-test}"
mkdir -p "$ROOT"

case "${1:-}" in
  start)
    [ -n "$OWNER" ] || { echo "round: set ORCA_UI_OWNER to your session name"; exit 2; }
    # Check, reserve and end our previous app under the mutex, before launching anything
    mutex_acquire
    if held_by_other; then
      echo "round: the screen is held by $(lock_field owner) (src $(lock_field src), since $(lock_field startedAt))"; exit 3
    fi
    prev_pid=$(lock_field pid); prev_src=$(lock_field src)
    write_lock $$
    end_app -TERM "$prev_pid" "${prev_src:-$SRC}" && end_app -TERM "" "$SRC" || { echo "round: previous Orca Dev still running"; exit 1; }
    mutex_release
    # A failed launch ends its own processes before giving up the reservation
    pid=
    failed_start() {
      end_app -KILL "$pid" "$SRC" || true
      mutex_acquire
      [ "$(lock_field pid)" = "$$" ] && rm -f "$LOCK"
      mutex_release
    }
    trap failed_start EXIT
    : > "$ROOT/dev.log"
    UNSETS=$(env | grep -E '^(ORCA_|JCODE_)' | cut -d= -f1 | sed 's/^/-u /' | tr '\n' ' ')
    # shellcheck disable=SC2086
    cd "$SRC"
    nohup env $UNSETS -u TERM_PROGRAM -u TERM_PROGRAM_VERSION -u __CFBundleIdentifier \
      ORCA_DEV_USER_DATA_PATH="$ROOT/userdata" pnpm dev >"$ROOT/dev.log" 2>&1 &
    pid=$!
    for _ in $(seq 1 120); do grep -q "DevTools listening" "$ROOT/dev.log" && break; sleep 3; done
    grep -q "DevTools listening" "$ROOT/dev.log" || { echo "round: Orca Dev did not start, see $ROOT/dev.log"; exit 1; }
    app=$(ls -dt "$SRC"/out/electron-dev/*/Orca*.app | head -1)
    cdp=$(grep -o 'ws://127.0.0.1:[0-9]*' "$ROOT/dev.log" | tail -1)
    trap - EXIT
    mutex_acquire
    write_lock "$pid" "$app" "$cdp" "$(git -C "$SRC" rev-parse --short HEAD)"
    mutex_release
    cat "$LOCK"
    ;;
  stop)
    mutex_acquire
    src=$(lock_field src); src=${src:-$SRC}
    if held_by_other; then
      echo "round: not stopping $(lock_field owner)'s round (src $src)"; exit 3
    fi
    end_app -TERM "$(lock_field pid)" "$src" || { echo "round: Orca Dev still running"; exit 1; }
    if [ "$(lock_field owner)" = "$OWNER" ]; then rm -f "$LOCK"; fi
    mutex_release
    echo stopped
    ;;
  reset)
    # The same fixture the folder e2e builds; it removes only its own directories, not the profile.
    bash "$SRC/tests/e2e/helpers/folder-multi-repo-fixture.sh" "$ROOT" >/dev/null
    echo "reset $ROOT/MultiProduct"
    ;;
  kill)
    mutex_acquire
    if held_by_other; then
      echo "round: not killing $(lock_field owner)'s round (src $(lock_field src))"; exit 3
    fi
    src=$(lock_field src)
    end_app -KILL "$(lock_field pid)" "${src:-$SRC}" || { echo "round: Orca Dev survived kill"; exit 1; }
    mutex_release
    echo killed
    ;;
  owner)
    lock_field owner
    ;;
  status)
    [ -f "$LOCK" ] && cat "$LOCK" || echo "no round"
    ;;
  *)
    echo "usage: round.sh start|stop|kill|reset|status|owner"; exit 2
    ;;
esac
