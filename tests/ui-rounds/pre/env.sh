# Sourced by every pre script: where this round's fixture and profile live, and how to rebuild the fixture.
UIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
# The running round's root (round.json) unless one is named, so these scripts edit the fixture the cases read
LOCK=$HOME/.cache/orca-ui-rounds/round.json
ROOT=${ORCA_UI_ROOT:-$([ -f "$LOCK" ] && python3 -I -c 'import json,sys; print(json.load(open(sys.argv[1])).get("root", ""))' "$LOCK")}
ROOT=${ROOT:-$HOME/orca-ui-test}
export ORCA_UI_ROOT=$ROOT
P=$ROOT/MultiProduct
reset_fixture() { bash "$UIR/round.sh" reset >/dev/null; }
# Restarts keep the round's owner, so the lock does not refuse its own relaunch.
ORCA_UI_OWNER=${ORCA_UI_OWNER:-$(bash "$UIR/round.sh" owner)}
export ORCA_UI_OWNER
app_stop() { bash "$UIR/round.sh" stop; }
app_start() { bash "$UIR/round.sh" start >/dev/null; sleep 8; }
# A crash: no orderly quit, so unsaved drafts stay in the session instead of prompting.
app_kill() { bash "$UIR/round.sh" kill; }
