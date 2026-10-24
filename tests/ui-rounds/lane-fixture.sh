#!/usr/bin/env bash
# Git Graph lane 摺疊測試用:建一個獨立 repo,有多條很久以前分出來、最近才有 commit 的長期分支,和比 HEAD 新的同事分支。
# Usage: lane-fixture.sh <dir>   (會刪掉重建 <dir>)
set -euo pipefail
R="${1:?dir required}"; rm -rf "$R"; git init -q -b main "$R"
g() { git -C "$R" "$@"; }
g config commit.gpgsign false
ci() { # ci <hour> <author> <message>
  local d; d=$(date -u -r $((1767225600 + $1*3600)) +%Y-%m-%dT%H:%M:%SZ)
  printf '%s\n' "$3" >> "$R/log.txt"; g add log.txt
  GIT_AUTHOR_DATE="$d" GIT_COMMITTER_DATE="$d" g -c user.name="$2" -c user.email="$(echo "$2" | tr 'A-Z ' 'a-z.')@example.test" commit -q -m "$3"
}
who() { case $(($1 % 4)) in 0) echo Alice;; 1) echo Bob;; 2) echo Carol;; *) echo Dan;; esac; }
for i in $(seq 1 160); do
  ci "$i" "$(who "$i")" "chore(app): tune module $i"
  g tag "m$i"
done
# 長期分支:很早分出來,最近才有 commit
n=0
for fork in 150 140 125 110 95 80 60 35 15; do
  n=$((n+1)); b="feature/long-$n"
  g checkout -q -b "$b" "m$fork"
  for k in 1 2; do ci $((200 + n*3 + k)) "$(who $((n+k)))" "feat($b): step $k on top of m$fork"; done
done
# 目前分支
g checkout -q -b feat/current m160
for k in 1 2 3; do ci $((240 + k)) Audi "feat(current): my work $k"; done
# 同事比 HEAD 新的分支
g checkout -q -b teammate/sidebar m155; ci 250 Erin "feat(sidebar): teammate change 1"; ci 251 Erin "feat(sidebar): teammate change 2"
g checkout -q -b teammate/relay m158; ci 252 Frank "fix(relay): teammate fix"
g checkout -q feat/current
g tag -d $(g tag -l 'm*') >/dev/null
echo "branches: $(g branch | wc -l)  commits: $(g rev-list --all | wc -l)  HEAD: $(g rev-parse --abbrev-ref HEAD)"
