#!/usr/bin/env bash
# Fork-only: registers fork-locale-json-merge.mjs for the locale catalogs in this clone (all its worktrees). Idempotent.
# Why a copy in the git dir: a rebase replays old locale commits before the tree has the driver.
# Why info/attributes: it outranks .gitattributes without an upstream edit.
set -euo pipefail

root=$(git rev-parse --show-toplevel)
common=$(git rev-parse --path-format=absolute --git-common-dir)
dest="$common/fork-merge-driver"
mkdir -p "$dest" "$common/info"
cp "$root/config/scripts/fork-locale-json-merge.mjs" "$dest/fork-locale-json-merge.mjs"

git config merge.fork-locale-json.name 'fork locale JSON deep merge'
git config merge.fork-locale-json.driver "node '$dest/fork-locale-json-merge.mjs' %O %A %B"

line='src/renderer/src/i18n/locales/*.json merge=fork-locale-json'
attributes="$common/info/attributes"
touch "$attributes"
grep -qxF "$line" "$attributes" || printf '%s\n' "$line" >>"$attributes"
echo "fork-merge-driver: locale catalogs merge with $dest/fork-locale-json-merge.mjs"
