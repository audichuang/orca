#!/usr/bin/env bash
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/env.sh"
. "$(dirname "${BASH_SOURCE[0]}")/ed-lib.sh"
# 草稿要先寫進 session 才能強制結束(模擬當機)
sleep 6
ed_kill
sqlite3 "$DB" "select payload from profile_state_documents where domain='workspaceSession'" | grep -q DRAFT || { echo "session 裡沒有 DRAFT 草稿" >&2; exit 1; }
echo offline >> "$P/WebApp/README.md"
ed_start
