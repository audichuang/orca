#!/bin/bash
# Usage: q1.sh [root]   (default ORCA_UI_ROOT or ~/orca-ui-test)
ROOT=${1:-${ORCA_UI_ROOT:-$HOME/orca-ui-test}}
# 列出 session 內每個 edit 分頁:擁有者前 16 字 | relativePath | MultiProduct 下路徑 | gitWorktreeId
sqlite3 "file:$ROOT/userdata/profiles/local-default/profile-state.db?mode=ro" \
 "select payload from profile_state_documents where domain='workspaceSession'" |
python3 -I -c 'import sys,json; d=json.load(sys.stdin)
for k,fs in d.get("openFilesByWorktree",{}).items():
  for f in fs: print(k[:16],"|",f["relativePath"],"|",f["filePath"].split("MultiProduct/")[-1],"|",f.get("gitWorktreeId","-"))'
