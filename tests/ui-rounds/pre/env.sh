# Sourced by every pre script: where this round's fixture and profile live, and how to rebuild the fixture.
UIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
ROOT=${ORCA_UI_ROOT:-$HOME/orca-ui-test}
P=$ROOT/MultiProduct
reset_fixture() { bash "$UIR/round.sh" reset >/dev/null; }
# Restarts keep the round's owner, so the lock does not refuse its own relaunch.
ORCA_UI_OWNER=${ORCA_UI_OWNER:-$(bash "$UIR/round.sh" owner)}
export ORCA_UI_OWNER
app_stop() { bash "$UIR/round.sh" stop; }
app_start() { bash "$UIR/round.sh" start >/dev/null; sleep 8; }
# A crash: no orderly quit, so unsaved drafts stay in the session instead of prompting.
app_kill() { bash "$UIR/round.sh" kill; }
# The round's DevTools port (round.sh records the ws URL), for pre scripts that call the renderer over CDP.
CDP_PORT=$(python3 -I -c 'import json,os,re,sys; print(re.search(r":(\d+)", json.load(open(sys.argv[1]))["cdp"]).group(1))' "$HOME/.cache/orca-ui-rounds/round.json")
