#!/usr/bin/env bash
# Builds the MultiProduct fixture tree for folder-multi-repo-source-control.spec.ts.
# Usage: folder-multi-repo-fixture.sh <fixture-root>   (idempotent: recreates <fixture-root>)
set -euo pipefail
ROOT="${1:?fixture root required}"
rm -rf "$ROOT"; mkdir -p "$ROOT"; ROOT=$(realpath "$ROOT")
P="$ROOT/MultiProduct"; REM="$ROOT/remotes"; mkdir -p "$P" "$REM"

mk() { mkdir -p "$1"; git -C "$1" init -q -b main
  git -C "$1" config user.name 'Orca E2E'; git -C "$1" config user.email e2e@example.invalid
  git -C "$1" config commit.gpgsign false; }
ci() { git -C "$1" add -A; git -C "$1" commit -qm "$2"; }
png() { printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00%s' "$1" > "$2"; }

# WebApp: every kind of change
W="$P/WebApp"; mk "$W"; mkdir -p "$W/src/components"
for f in staged-mod unstaged-mod partial deleted-unstaged deleted-staged old-name; do
  printf '%s\nline2\nline3\n' "$f" > "$W/src/$f.ts"
done
printf '# WebApp\nbase readme\n' > "$W/README.md"
png a "$W/logo.png"
ci "$W" init
echo 'staged-edit' >> "$W/src/staged-mod.ts"; git -C "$W" add src/staged-mod.ts
echo 'unstaged-edit' >> "$W/src/unstaged-mod.ts"
echo 'index-edit' >> "$W/src/partial.ts"; git -C "$W" add src/partial.ts
echo 'worktree-edit' >> "$W/src/partial.ts"
mkdir -p "$W/src/components/new"; printf 'export const N = 1\n' > "$W/src/components/new/Widget.tsx"
rm "$W/src/deleted-unstaged.ts"
git -C "$W" rm -q src/deleted-staged.ts
git -C "$W" mv src/old-name.ts src/new-name.ts
png b "$W/logo.png"
echo 'webapp readme change' >> "$W/README.md"

# api-server: ahead 2 / behind 1 against a local bare origin
git init -q --bare -b main "$REM/api-server.git"
A="$P/api-server"; mk "$A"; printf 'base\n' > "$A/server.ts"; printf '# api\nbase\n' > "$A/README.md"; ci "$A" base
git -C "$A" remote add origin "$REM/api-server.git"; git -C "$A" push -qu origin main
git clone -q "$REM/api-server.git" "$ROOT/api-side"
git -C "$ROOT/api-side" config user.name side; git -C "$ROOT/api-side" config user.email s@x.invalid
echo remote >> "$ROOT/api-side/remote.txt"; ci "$ROOT/api-side" remote-1; git -C "$ROOT/api-side" push -q origin main
for i in 1 2; do echo "local $i" >> "$A/server.ts"; ci "$A" "local-$i"; done
git -C "$A" fetch -q origin
echo 'unstaged api' >> "$A/server.ts"
echo 'api readme change' >> "$A/README.md"
rm -rf "$ROOT/api-side"

# libs/shared/core: nested two levels deep
C="$P/libs/shared/core"; mk "$C"; printf 'one\n' > "$C/core.ts"; printf 'x\n' > "$C/extra.ts"; ci "$C" init
echo 'core change' >> "$C/core.ts"; echo untracked > "$C/untracked.txt"

# docs-site: clean
D="$P/docs-site"; mk "$D"; echo docs > "$D/index.md"; ci "$D" init

# WebApp-feature: linked worktree of WebApp
git -C "$W" worktree add -q ../WebApp-feature -b feature/x
echo 'feature change' >> "$P/WebApp-feature/src/unstaged-mod.ts"

# Symlink-escape targets for the restore guard; excluded so they stay out of git status and copy payloads.
ln -s .git "$W/git-alias"; ln -s "$ROOT" "$W/outside-link"
printf '/git-alias\n/outside-link\n' >> "$W/.git/info/exclude"

# notes: not a git repo
mkdir -p "$P/notes"; echo note > "$P/notes/todo.txt"
echo "$P"
