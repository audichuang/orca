#!/usr/bin/env bash
# Scenario test for fork-rebase-continue.sh and fork-canary-apply.sh: real rebases with conflicts in temp repos.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
cont="$here/fork-rebase-continue.sh"
apply="$here/fork-canary-apply.sh"
t=$(mktemp -d)
trap 'rm -rf "$t"' EXIT
failed=0

ok() { echo "ok   $1"; }
bad() { echo "FAIL $1"; failed=1; }
# expect <label> <want> <got>
expect() { if [ "$2" = "$3" ]; then ok "$1"; else bad "$1: want [$2], got [$3]"; fi; }
# run <cmd>...: prints the exit code, keeps the output in $t/out
run() { local rc=0; "$@" > "$t/out" 2>&1 || rc=$?; echo "$rc"; }
new_repo() { rm -rf "$1" && mkdir "$1" && cd "$1" && git init -q -b main; }

export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null
export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t

# --- fork-rebase-continue.sh: f.txt and g.txt conflict, h.txt resolves to an empty commit (git drops it)
new_repo "$t/repo"
printf 'a\nb\nc\n' > f.txt && printf 'x\ny\nz\n' > g.txt && printf 'p\nq\nr\n' > h.txt
git add . && git commit -qm base
git checkout -q -b fork
printf 'a\nb-fork\nc\n' > f.txt && git commit -qam "fork f"
printf 'x\ny-fork\nz\n' > g.txt && git commit -qam "fork g"
printf 'p\nq-fork\nr\n' > h.txt && git commit -qam "fork h"
git checkout -q main
printf 'a\nb-up\nc\n' > f.txt && printf 'x\ny-up\nz\n' > g.txt && printf 'p\nq-up\nr\n' > h.txt
git commit -qam upstream
git checkout -q fork
review=$t/review

rc=0
git rebase main > /dev/null 2>&1 || rc=$?
expect "rebase stops on the first conflict" 1 "$rc"

expect "refuses leftover markers" 2 "$(run bash "$cont" "$review")"
git rebase --show-current-patch > /dev/null 2>&1 && ok "still in rebase after refusal" || bad "rebase gone after refusal"
[ ! -s "$review/resolved-files.txt" ] && ok "nothing recorded on refusal" || bad "recorded files on refusal"

printf 'a\nb-up\nb-fork\nc\n' > f.txt
expect "stops at the next conflict" 1 "$(run bash "$cont" "$review")"
grep -q 'g.txt' "$t/out" && ok "names the next conflict file" || bad "next conflict file not printed: $(cat "$t/out")"

printf 'x\ny-up\ny-fork\nz\n' > g.txt
expect "stops at the third conflict" 1 "$(run bash "$cont" "$review")"

printf 'p\nq-up\nr\n' > h.txt
expect "resolution equal to upstream drops the empty commit and finishes" 0 "$(run bash "$cont" "$review")"
grep -q '^REBASE DONE' "$t/out" && ok "prints REBASE DONE" || bad "no REBASE DONE: $(cat "$t/out")"

printf 'f.txt\ng.txt\nh.txt\n' > "$t/want"
cmp -s "$t/want" "$review/resolved-files.txt" && ok "resolved-files.txt has each file once" || bad "resolved-files.txt: $(cat "$review/resolved-files.txt")"
expect "continue outside a rebase is an error" 2 "$(run bash "$cont" "$review")"

# --- last stop: continue completes the rebase
new_repo "$t/repo2"
printf 'a\nb\nc\n' > f.txt && git add . && git commit -qm base
git checkout -q -b fork
printf 'a\nb-fork\nc\n' > f.txt && git commit -qam "fork f"
git checkout -q main
printf 'a\nb-up\nc\n' > f.txt && git commit -qam upstream
git checkout -q fork
git rebase main > /dev/null 2>&1 || true
printf 'a\nb-up\nb-fork\nc\n' > f.txt
expect "last stop completes the rebase" 0 "$(run bash "$cont" "$t/review2")"
grep -q '^REBASE DONE' "$t/out" && ok "prints REBASE DONE" || bad "no REBASE DONE: $(cat "$t/out")"

# --- fork-canary-apply.sh: the cache holds f.txt as resolved against upstream, with the later fork edit included
new_repo "$t/repo3"
printf 'a\nb\nc\nd\n' > f.txt && printf 'x\ny\nz\n' > g.txt && git add . && git commit -qm base
git checkout -q -b fork
printf 'a\nb-fork\nc\nd\n' > f.txt && printf 'x\ny-fork\nz\n' > g.txt && git commit -qam "fork 1"
printf 'a\nb-fork\nc\nd-fork\n' > f.txt && git commit -qam "fork 2"
git checkout -q main
printf 'a\nb-up\nc\nd\n' > f.txt && printf 'x\ny-up\nz\n' > g.txt && git commit -qam upstream
up=$(git rev-parse --short HEAD)
cache=$t/canary
mkdir -p "$cache/resolution/files"
printf -- '- Upstream: `%s` (origin/main), 1 commits past the merge-base\n' "$up" > "$cache/report.md"
printf 'a\nb-fork\nc\nd-fork\n' > "$cache/resolution/files/f.txt"
printf 'x\nBOGUS\nz\n' > "$cache/resolution/files/g.txt"
git checkout -q fork
git rebase main > /dev/null 2>&1 || true
cp g.txt "$t/g.before"

expect "applies one cached file, refuses the others" 1 "$(run bash "$apply" "$cache" f.txt g.txt h.txt)"
cmp -s f.txt "$cache/resolution/files/f.txt" && ok "f.txt equals the cache" || bad "f.txt differs: $(cat f.txt)"
grep -q '^MERGED f.txt' "$t/out" && ok "f.txt reported MERGED" || bad "no MERGED line: $(cat "$t/out")"
grep -q '^CONFLICT g.txt' "$t/out" && ok "g.txt reason printed" || bad "no CONFLICT line: $(cat "$t/out")"
cmp -s g.txt "$t/g.before" && ok "refused file untouched" || bad "g.txt was modified"
grep -q '^NO-CANARY h.txt' "$t/out" && ok "h.txt reported NO-CANARY" || bad "no NO-CANARY line: $(cat "$t/out")"
expect "outside a rebase is a setup error" 2 "$(cd "$t" && run bash "$apply" "$cache" f.txt)"

exit "$failed"
