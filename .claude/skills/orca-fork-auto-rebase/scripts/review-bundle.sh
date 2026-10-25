#!/bin/bash
# Builds the reviewer inputs for a fork rebase. Usage: review-bundle.sh <vOLD> <OLD_DEVELOP> <vNEW> <NEW_HEAD> <out-dir>
# Writes: range-diff.txt (only changed/added/dropped fork commits), extra-commits.diff, upstream-touching.diff,
# importer-sweep.txt (upstream-changed modules that fork-touched files import), seam-upstream.diff, README.txt.
set -euo pipefail
vold=$1 olddev=$2 vnew=$3 head=$4 out=$5
mkdir -p "$out"

git range-diff --no-color "$vold..$olddev" "$vnew..$head" > "$out/range-diff.full.txt"
awk '
  /^ *([0-9]+|-): +[0-9a-f-]+ [=!<>] / { keep = ($0 !~ / = /) }
  keep
' "$out/range-diff.full.txt" > "$out/range-diff.txt"

# New-side shas of commits that changed (!) or were added (>) by the rebase.
changed=$(awk '/^ *([0-9]+|-): +[0-9a-f-]+ [!>] / { print $5 }' "$out/range-diff.full.txt" \
  | grep -E '^[0-9a-f]{7,}$' || true)
# Commits that exist only on the new side are the rebase's own fixes.
extra=$(awk '/^ *-: +-+ > / { print $5 }' "$out/range-diff.full.txt" || true)
: > "$out/extra-commits.diff"
for c in $extra; do git show --stat --patch "$c" >> "$out/extra-commits.diff"; done

files=$(for c in $changed; do git show --name-only --format= "$c"; done | sort -u)
if [ -n "$files" ]; then
  # shellcheck disable=SC2086
  git diff "$vold" "$vnew" -- $files > "$out/upstream-touching.diff"
else
  : > "$out/upstream-touching.diff"
fi

# Upstream API changes that reach fork code without a textual conflict (the autosave-hold class).
fork_files=$(git diff --name-only "$vnew" "$head" -- 'src/*.ts' 'src/*.tsx' | grep -v '\.test\.' || true)
imports="$out/.fork-imports.txt"
: > "$imports"
for f in $fork_files; do
  git show "$head:$f" 2>/dev/null | grep -oE "from ['\"][^'\"]+['\"]" | sed "s#^#$f #" >> "$imports" || true
done
{
  echo "# upstream-changed module -> fork-touched importers"
  git diff --name-only "$vold" "$vnew" -- 'src/*.ts' 'src/*.tsx' | grep -v '\.test\.' | while read -r up; do
    mod=$(basename "${up%.*}")
    if [ "$mod" = index ]; then continue; fi
    hits=$(grep -E "/$mod['\"]\$" "$imports" | cut -d' ' -f1 | sort -u || true)
    if [ -n "$hits" ]; then echo "$up"; echo "$hits" | sed 's/^/    /'; fi
  done
} > "$out/importer-sweep.txt"

# Upstream changes near fork seams, the review subject when the rebase is CLEAN: upstream can add a parallel
# path (a new content-type switch, updater entry point, rebuilt options object) without touching a fork line.
seam_re="${FORK_SEAM_RE:-gitWorktreeId|skipRenderLimit|missingSides|git-graph|TabContentType|contentType|isForkDistribution|GitHistoryPanel|renderCommitFilesMenu|EditorFileRecord|OpenFile\b|updater|clipcode|ClipCode}"
fork_modified=$(git diff --name-only --diff-filter=M "$vnew" "$head" -- 'src/*' | grep -v '\.test\.' || true)
fork_added=$(git diff --name-only --diff-filter=A "$vnew" "$head" -- 'src/*.ts' 'src/*.tsx' | grep -v '\.test\.' || true)
# Why `|| true` per file: a fork file with no imports makes grep exit 1, which pipefail would turn into a fatal loop.
imported_mods=$(for f in $fork_added; do git show "$head:$f" 2>/dev/null | grep -oE "from ['\"][^'\"]+['\"]" | sed -E "s#.*/([^/'\"]+)['\"]\$#\1#" || true; done | sort -u)
seam_files=$(git diff --name-only "$vold" "$vnew" -- 'src/*.ts' 'src/*.tsx' | grep -v '\.test\.' | while read -r up; do
  mod=$(basename "${up%.*}")
  if echo "$fork_modified" | grep -qxF "$up" || { [ "$mod" != index ] && echo "$imported_mods" | grep -qxF "$mod"; } \
     || { git show "$vnew:$up" >"$out/.seam-probe" 2>/dev/null && grep -qE "$seam_re" "$out/.seam-probe"; }; then echo "$up"; fi
done)
if [ -n "$seam_files" ]; then
  # shellcheck disable=SC2086
  git diff "$vold" "$vnew" -- $seam_files > "$out/seam-upstream.diff"
else
  : > "$out/seam-upstream.diff"
fi

cat > "$out/README.txt" <<EOF
vOLD=$vold OLD_DEVELOP=$olddev vNEW=$vnew NEW_HEAD=$head
changed-or-added fork commits: $(echo "$changed" | grep -c . || true)
rebase-only extra commits: $(echo "$extra" | grep -c . || true)
range-diff.txt          fork commits whose content changed in the rebase (old vs new patch)
extra-commits.diff      commits the rebase added (fixes, lint sync)
upstream-touching.diff  upstream vOLD..vNEW changes to files those fork commits touch
importer-sweep.txt      upstream-changed modules imported by fork-touched files (check call sites)
seam-upstream.diff      upstream vOLD..vNEW changes to fork-modified files, modules fork files import, and files naming a fork seam ($(echo "$seam_files" | grep -c . || true) files)
EOF
wc -l "$out"/*.txt "$out"/*.diff
