. "$(dirname "${BASH_SOURCE[0]}")/env.sh"
# ED / SS / MD 組 pre 腳本共用函式,以 `. "$(dirname "${BASH_SOURCE[0]}")/ed-lib.sh"` 載入
OT=$ROOT
P=$OT/MultiProduct
DB=$OT/userdata/profiles/local-default/profile-state.db

ed_reset() { reset_fixture; }

# 衝突前置 CF(04-ed.md),要在重置之後執行
ed_conflict() {
  ( cd "$P/docs-site"
    git switch -q -c side; printf 'docs\nside change\n' > index.md; printf 'side readme\n' > README.md
    git add -A && git commit -qm side
    git switch -q main; printf 'docs\nmain change\n' > index.md; printf 'main readme\n' > README.md
    git add -A && git commit -qm main
    git merge side >/dev/null || true
    git status --short )
}

ed_stop() { app_stop; }
ed_kill() { app_kill; }
# 之後 lcu 要先重新 getApp
ed_start() { app_start; }

ed_q1_snapshot() { sleep 6; bash "$UIR/q1.sh" > "$1"; }

# 改 session:mode = strip(剝掉 gitWorktreeId)或 invalid(指到不存在的 repo);先備份到 ed-ss-backup.db。要在 Orca 停止後呼叫
ed_session_edit() {
  sqlite3 "$DB" ".backup '$OT/ed-ss-backup.db'"
  python3 -I - "$DB" "$1" <<'PY'
import sys, json, sqlite3, hashlib
db = sqlite3.connect(sys.argv[1]); mode = sys.argv[2]
(p,) = db.execute("select payload from profile_state_documents where domain='workspaceSession'").fetchone()
d = json.loads(p); n = 0
for fs in d.get('openFilesByWorktree', {}).values():
    for f in fs:
        if 'gitWorktreeId' in f:
            n += 1
            if mode == 'strip': f.pop('gitWorktreeId')
            else: f['gitWorktreeId'] = '00000000-0000-0000-0000-000000000000::/nonexistent'
s = json.dumps(d, ensure_ascii=False, separators=(',', ':'))
db.execute("update profile_state_documents set payload=?,content_hash=? where domain='workspaceSession'", (s, hashlib.sha256(s.encode()).hexdigest()))
db.commit(); print(mode, n)
if n == 0: sys.exit('session 裡沒有任何 gitWorktreeId,前置沒做好')
PY
}

ed_session_restore() { sqlite3 "$DB" ".restore '$OT/ed-ss-backup.db'"; echo restored; }
