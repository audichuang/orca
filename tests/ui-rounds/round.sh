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
# The active round's root unless one is named, so pre scripts and reset touch the fixture the cases read
ROOT="${ORCA_UI_ROOT:-$(lock_field root)}"
ROOT="${ROOT:-$HOME/orca-ui-test}"
mkdir -p "$ROOT"

case "${1:-}" in
  start)
    [ -n "$OWNER" ] || { echo "round: set ORCA_UI_OWNER to your session name"; exit 2; }
    # Check and reserve under one mkdir mutex, before stopping or launching anything
    until mkdir "$LOCK.mutex" 2>/dev/null; do sleep 0.2; done
    if held_by_other; then
      rmdir "$LOCK.mutex"
      echo "round: the screen is held by $(lock_field owner) (src $(lock_field src), since $(lock_field startedAt))"; exit 3
    fi
    prev_pid=$(lock_field pid); prev_src=$(lock_field src)
    write_lock $$
    rmdir "$LOCK.mutex"
    trap 'if [ "$(lock_field pid)" = "$$" ]; then rm -f "$LOCK"; fi' EXIT
    [ -n "$prev_pid" ] && kill_tree "$prev_pid"
    pkill -f "${prev_src:-$SRC}/out/electron-dev/" 2>/dev/null || true
    pkill -f "$SRC/out/electron-dev/" 2>/dev/null || true
    for _ in $(seq 1 15); do app_running "$SRC" || break; sleep 1; done
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
    write_lock "$pid" "$app" "$cdp" "$(git -C "$SRC" rev-parse --short HEAD)"
    trap - EXIT
    cat "$LOCK"
    ;;
  stop)
    src=$(lock_field src); src=${src:-$SRC}
    if held_by_other; then
      echo "round: not stopping $(lock_field owner)'s round (src $src)"; exit 3
    fi
    # Why by path: the installed Orca and other checkouts' dev builds share the bundle id.
    pid=$(lock_field pid)
    [ -n "$pid" ] && kill_tree "$pid"
    pkill -f "$src/out/electron-dev/" 2>/dev/null || true
    for _ in $(seq 1 15); do app_running "$src" || break; sleep 1; done
    if app_running "$src"; then echo "round: Orca Dev still running"; exit 1; fi
    [ "$(lock_field owner)" = "$OWNER" ] && rm -f "$LOCK"
    echo stopped
    ;;
  reset)
    # The same fixture the folder e2e builds; it removes only its own directories, not the profile.
    bash "$SRC/tests/e2e/helpers/folder-multi-repo-fixture.sh" "$ROOT" >/dev/null
    echo "reset $ROOT/MultiProduct"
    ;;
  kill)
    if held_by_other; then
      echo "round: not killing $(lock_field owner)'s round (src $(lock_field src))"; exit 3
    fi
    pid=$(lock_field pid); src=$(lock_field src)
    pkill -9 -f "${src:-$SRC}/out/electron-dev/" 2>/dev/null || true
    [ -n "$pid" ] && kill_tree "$pid"
    sleep 3; echo killed
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
