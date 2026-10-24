#!/bin/bash
# A hands-on UI round against a visible Orca Dev: start | stop | reset | status.
# The app runs from the checkout holding this script, so the cases and the UI under test share a commit.
# ORCA_UI_ROOT (default ~/orca-ui-test) holds the profile, the MultiProduct fixture and the clipboard log.
# ORCA_UI_OWNER names who holds the screen (a session name); the lock stops two rounds driving one screen.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
SRC=$(cd "$HERE/../.." && pwd)
ROOT="${ORCA_UI_ROOT:-$HOME/orca-ui-test}"
OWNER="${ORCA_UI_OWNER:-}"
LOCK="$HOME/.cache/orca-ui-rounds/round.json"
mkdir -p "$ROOT" "$(dirname "$LOCK")"

lock_field() { [ -f "$LOCK" ] && python3 -I -c 'import json,sys; print(json.load(open(sys.argv[1])).get(sys.argv[2], ""))' "$LOCK" "$1" || true; }
app_running() { pgrep -f "$1/out/electron-dev/" >/dev/null; }
kill_tree() { local c; for c in $(pgrep -P "$1" 2>/dev/null); do kill_tree "$c"; done; kill "$1" 2>/dev/null || true; }

case "${1:-}" in
  start)
    [ -n "$OWNER" ] || { echo "round: set ORCA_UI_OWNER to your session name"; exit 2; }
    held=$(lock_field owner)
    if [ -n "$held" ] && [ "$held" != "$OWNER" ] && app_running "$(lock_field src)"; then
      echo "round: the screen is held by $held (src $(lock_field src), since $(lock_field startedAt))"; exit 3
    fi
    bash "$HERE/round.sh" stop >/dev/null
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
    python3 -I - "$LOCK" "$OWNER" "$ROOT" "$SRC" "$app" "$cdp" "$(git -C "$SRC" rev-parse --short HEAD)" "$pid" <<'PY'
import json, sys, datetime
lock, owner, root, src, app, cdp, commit, pid = sys.argv[1:9]
json.dump({"owner": owner, "root": root, "src": src, "app": app, "cdp": cdp, "commit": commit, "pid": int(pid),
           "startedAt": datetime.datetime.now().isoformat(timespec="seconds")}, open(lock, "w"), indent=1)
PY
    cat "$LOCK"
    ;;
  stop)
    src=$(lock_field src); src=${src:-$SRC}
    held=$(lock_field owner)
    if [ -n "$held" ] && [ "$held" != "$OWNER" ] && app_running "$src"; then
      echo "round: not stopping $held's round (src $src)"; exit 3
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
