#!/usr/bin/env bash
# Fork-only: registers fork-locale-json-merge.mjs for the locale catalogs in this clone (all its worktrees). Idempotent.
# Why a copy in the git dir: a rebase replays old locale commits before the tree has the driver.
# Why info/attributes: it outranks .gitattributes without an upstream edit.
set -euo pipefail

root=$(git rev-parse --show-toplevel)
# Why cd + pwd: --path-format=absolute needs git 2.31.
common=$(cd "$(git rev-parse --git-common-dir)" && pwd -P)
dest="$common/fork-merge-driver"
mkdir -p "$dest" "$common/info"
# Why a rename: a merge in another worktree may run the driver mid-copy, and an empty script exits 0 unmerged.
tmp=$(mktemp "$dest/.fork-locale-json-merge.XXXXXX")
cp "$root/config/scripts/fork-locale-json-merge.mjs" "$tmp"
mv -f "$tmp" "$dest/fork-locale-json-merge.mjs"

git config merge.fork-locale-json.name 'fork locale JSON deep merge'
node=$(command -v node) || { echo "fork-merge-driver: node is not on PATH" >&2; exit 1; }
quote() { printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"; }
# Why the 127 branch: a driver that cannot start would leave ours unmarked, and git add would drop theirs silently.
git config merge.fork-locale-json.driver \
  "$(quote "$node") $(quote "$dest/fork-locale-json-merge.mjs") %O %A %B; s=\$?; [ \$s -ne 127 ] || { git merge-file -L ours -L base -L theirs %A %O %B; s=1; }; exit \$s"

line='src/renderer/src/i18n/locales/*.json merge=fork-locale-json'
attributes="$common/info/attributes"
touch "$attributes"
# Why: appending to a file without a final newline would join the two lines.
[ ! -s "$attributes" ] || [ -z "$(tail -c1 "$attributes")" ] || echo >>"$attributes"
grep -qxF "$line" "$attributes" || printf '%s\n' "$line" >>"$attributes"
echo "fork-merge-driver: locale catalogs merge with $dest/fork-locale-json-merge.mjs"
