#!/usr/bin/env bash
# Git Graph 測試用:在 round.sh reset 之後執行,替 MultiProduct/WebApp 疊上複雜的分支歷史。
# 不碰 WebApp 的 main 與工作區(其他測案依賴它的未提交變更);所有新歷史從另一個 clone 推進 refs。
# Usage: graph-fixture.sh <fixture-root>
set -euo pipefail
ROOT=$(realpath "${1:?fixture root required}")
W="$ROOT/MultiProduct/WebApp"; REM="$ROOT/remotes"; SRC="$ROOT/graph-src"
rm -rf "$SRC" "$REM/webapp-origin.git" "$REM/webapp-upstream.git" "$ROOT/graph-upstream-src"
git clone -q "$W" "$SRC"
g() { git -C "$SRC" "$@"; }
g config commit.gpgsign false
N=0
ci() { # ci <author> <message> [file content]...
  local who="$1" msg="$2"; shift 2
  while [ $# -ge 2 ]; do mkdir -p "$SRC/$(dirname "$1")"; printf '%s\n' "$2" > "$SRC/$1"; g add "$1"; shift 2; done
  N=$((N+1)); local d; d=$(date -u -r $((1767225600 + N*3600)) +%Y-%m-%dT%H:%M:%SZ)
  GIT_AUTHOR_DATE="$d" GIT_COMMITTER_DATE="$d" g -c user.name="$who" -c user.email="$(echo "$who" | tr 'A-Z ' 'a-z.')@example.test" \
    commit -q --allow-empty -m "$msg"
}
g checkout -q -b develop
for i in $(seq 1 130); do
  case $((i % 3)) in 0) who=Alice;; 1) who=Bob;; *) who=Carol;; esac
  ci "$who" "chore(app): tune module $i" "src/app/module$((i % 7)).ts" "export const v = $i"
  case $i in
    10) g branch feature/login ;;
    15) g branch feature/payments ;;
    20) g branch bugfix/crash ;;
    30) g branch release/1.0 ;;
  esac
done
g checkout -q feature/login
ci Alice "feat(auth): add login form" src/auth/login.ts "export function login() { return 'v1' }"
ci Alice "feat(auth): validate login input" src/auth/login.ts "export function login(u: string) { return u.trim() }"
ci Alice "feat(auth): remember me option" src/auth/remember.ts "export const remember = true"
g mv src/auth/remember.ts src/auth/session.ts; ci Alice "refactor(auth): rename remember to session"
ci Alice "fix(auth): login redirect loop" src/auth/login.ts "export function login(u: string) { return u.trim().toLowerCase() }"
g checkout -q feature/payments
ci Bob "feat(pay): payment gateway client" src/pay/gateway.ts "export const gateway = 'stripe'"
ci Bob "feat(pay): retry failed payment" src/pay/retry.ts "export const retries = 3"
ci Bob "test(pay): payment retry cases" src/pay/retry.test.ts "test('retry', () => {})"
g checkout -q develop
d=$(date -u -r $((1767225600 + 900*3600)) +%Y-%m-%dT%H:%M:%SZ)
GIT_AUTHOR_DATE="$d" GIT_COMMITTER_DATE="$d" g -c user.name=Bob -c user.email=bob@example.test \
  merge -q --no-ff feature/payments -m "Merge branch 'feature/payments' into develop"
g checkout -q bugfix/crash
ci Carol "fix(core): crash on empty config" src/core/config.ts "export const config = {}"
printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDRcrash' > "$SRC/assets/crash.png" 2>/dev/null || { mkdir -p "$SRC/assets"; printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDRcrash' > "$SRC/assets/crash.png"; }
g add assets/crash.png; ci Carol "fix(core): add crash screenshot"
g rm -q src/app/module1.ts; ci Carol "fix(core): remove crashing module1"
g checkout -q release/1.0
ci Alice "release: 1.0.0" CHANGELOG.md "# 1.0.0"
g tag -a v1.0.0 -m "v1.0.0"
# 推進 WebApp:新分支與 tag(main 與工作區不動)
git -C "$W" fetch -q "$SRC" \
  '+refs/heads/develop:refs/heads/develop' '+refs/heads/feature/login:refs/heads/feature/login' \
  '+refs/heads/feature/payments:refs/heads/feature/payments' '+refs/heads/bugfix/crash:refs/heads/bugfix/crash' \
  '+refs/heads/release/1.0:refs/heads/release/1.0' '+refs/tags/v1.0.0:refs/tags/v1.0.0'
# 兩個 remote:origin 有 remote 才有的實驗分支;upstream 有 next
git init -q --bare -b main "$REM/webapp-origin.git"; git init -q --bare -b main "$REM/webapp-upstream.git"
g remote add origin2 "$REM/webapp-origin.git"
g push -q origin2 develop feature/login
g checkout -q -b experiment/remote-only develop
ci Bob "experiment: remote-only search index" src/search/index.ts "export const index = []"
ci Bob "experiment: remote-only ranking" src/search/rank.ts "export const rank = 1"
g push -q origin2 experiment/remote-only
g remote add upstream "$REM/webapp-upstream.git"
g checkout -q -b next develop
ci Carol "upstream: next-gen renderer" src/render/next.ts "export const next = true"
ci Carol "upstream: renderer flags" src/render/flags.ts "export const flags = {}"
ci Carol "upstream: renderer docs" docs/render.md "# renderer"
g push -q upstream next:next
git -C "$W" remote remove origin 2>/dev/null || true
git -C "$W" remote add origin "$REM/webapp-origin.git"
git -C "$W" remote add upstream "$REM/webapp-upstream.git" 2>/dev/null || true
git -C "$W" fetch -q origin; git -C "$W" fetch -q upstream
rm -rf "$SRC"
echo "graph fixture: $(git -C "$W" rev-list --all --count) commits, $(git -C "$W" for-each-ref refs/heads refs/remotes | wc -l | tr -d ' ') refs"
