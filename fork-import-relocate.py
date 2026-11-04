#!/usr/bin/env python3
"""Follow upstream's module moves in fork code (written by the fork canary, 2026-11-05).

Run from the repo root of a merge or rebase in progress. <base> is the old tree whose paths the fork code was
written against (the canary: merge-base of HEAD and MERGE_HEAD; a rebase: the old upstream tag vOLD), <new> the
upstream tree the fork is moving onto (HEAD in the canary, vNEW in a rebase). Renames come from
`git diff -M --name-status <base> <new>`.

  fork-import-relocate.py rewrite <base> <new> <file>...
      Rewrite, in place, import specifiers (from '…', import('…'), vi.mock('…'), vi.importActual('…'),
      require('…'), import '…') that no longer resolve from the file's current path but resolved in <base>
      (relative to the file's old path if the file itself was renamed) to a file upstream renamed. `@/` and
      `@renderer/` specifiers stay aliased; relative ones are recomputed.
      Then splits named imports whose names the new module no longer exports (upstream split one module into
      several) into one import per module that does export them.
  fork-import-relocate.py paths <base> <new> <file>...
      Replace repo-relative path literals (with or without the leading `src/`) of files upstream renamed, in
      fork-owned files such as allowlists, config/fork-*.txt and baselines. Only for files the fork added: in
      upstream files the old paths in comments are upstream's business.
  fork-import-relocate.py merge <base> <new> <merge-base> <ours> <fork> <file>...
      For a conflicted file at its new path: rewrite the <merge-base> and <fork> sides' specifiers to the new
      paths, run oxfmt on both, then `git merge-file` them onto <ours>'s version and write the result (conflict
      markers left only where real code conflicts). Prints the number of conflict hunks per file.
      Canary: `merge $b HEAD $b HEAD MERGE_HEAD <file>` (b = merge-base HEAD MERGE_HEAD).
      Rebase stop: `merge vOLD vNEW REBASE_HEAD^ HEAD REBASE_HEAD <file>`.
"""
import os
import posixpath
import re
import subprocess
import sys

EXTS = ['', '.ts', '.tsx', '.d.ts', '.js', '.mjs', '.cjs', '.json', '.css', '/index.ts', '/index.tsx', '/index.js']
ALIASES = {'@/': 'src/renderer/src/', '@renderer/': 'src/renderer/src/'}
SPEC = re.compile(
    r"""((?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+|\bvi\.(?:mock|doMock|unmock|importActual|importMock)\s*\(\s*|\brequire\s*\(\s*)(['"]))([^'"\n]+)(\2)"""
)


def git(*args, inp=None):
    return subprocess.run(['git', *args], check=True, capture_output=True, text=True, input=inp).stdout


def tree_files(ref):
    return set(git('ls-tree', '-r', '--name-only', ref).split('\n')) - {''}


def worktree_files():
    out = git('ls-files', '-c', '-o', '--exclude-standard')
    return {f for f in out.split('\n') if f and os.path.exists(f)}


class Ctx:
    def __init__(self, base, new, extra_old=()):
        self.base, self.new = base, new
        self.renames = {}
        for line in git('diff', '-M', '--name-status', base, new).split('\n'):
            parts = line.split('\t')
            if parts[0].startswith('R') and len(parts) == 3:
                self.renames[parts[1]] = parts[2]
        # moves git's rename detection missed (file rewritten while moving): same basename, deleted here, added once
        status = [l.split('\t') for l in git('diff', '--no-renames', '--name-status', base, new).split('\n') if l]
        added = {}
        for parts in status:
            if parts[0] == 'A':
                added.setdefault(posixpath.basename(parts[1]), []).append(parts[1])
        taken = set(self.renames.values())
        for parts in status:
            if parts[0] == 'D' and parts[1] not in self.renames:
                cands = [c for c in added.get(posixpath.basename(parts[1]), []) if c not in taken]
                if len(cands) == 1:
                    self.renames[parts[1]] = cands[0]
        self.reverse = {v: k for k, v in self.renames.items()}
        self.new_files = worktree_files()
        # fork-only files live at the same path on both sides; they count as resolvable old targets too
        self.old_files = tree_files(base) | set(extra_old)

    def resolve(self, target, files):
        for ext in EXTS:
            if target + ext in files:
                return target + ext, ext
        return None, None

    def target_of(self, spec, file_dir):
        for alias, root in ALIASES.items():
            if spec.startswith(alias):
                return root + spec[len(alias):], alias
        if spec.startswith('.'):
            return posixpath.normpath(posixpath.join(file_dir, spec)), None
        return None, None

    def respec(self, new_target, ext, alias, file_dir):
        stem = new_target[: len(new_target) - len(ext)] if ext and new_target.endswith(ext) else new_target
        if alias:
            root = ALIASES[alias]
            if stem.startswith(root):
                return alias + stem[len(root):]
        rel = posixpath.relpath(stem, file_dir)
        return rel if rel.startswith('.') else './' + rel

    def rewrite_text(self, text, old_path, new_path, keep_if_resolves):
        old_dir, new_dir = posixpath.dirname(old_path), posixpath.dirname(new_path)

        def sub(m):
            spec = m.group(3)
            if keep_if_resolves:
                t, alias = self.target_of(spec, new_dir)
                if t is None or self.resolve(t, self.new_files)[0]:
                    return m.group(0)
            t, alias = self.target_of(spec, old_dir)
            if t is None:
                return m.group(0)
            old_file, ext = self.resolve(t, self.old_files)
            if old_file is None:
                return m.group(0)
            new_file = self.renames.get(old_file, old_file)
            if new_file not in self.new_files:
                return m.group(0)
            if new_file == old_file and old_dir == new_dir:
                return m.group(0)
            # keep the specifier's suffix form: explicit extension stays, implicit one stays implicit
            if ext and not new_file.endswith(ext):
                return m.group(0)
            new_spec = self.respec(new_file, ext, alias, new_dir)
            return m.group(1) + new_spec + m.group(4)

        return SPEC.sub(sub, text)


NAMED = re.compile(r"""(^|\n)([ \t]*)(import|export)(\s+type)?\s*\{([^}]*)\}\s*from\s*(['"])([^'"\n]+)\6""")


class Exports:
    """Which upstream module now exports a name, for modules upstream split into several files."""

    def __init__(self, ctx):
        self.ctx = ctx
        self.cache = {}
        added = git('diff', '--diff-filter=A', '--name-only', ctx.base, ctx.new).split('\n')
        pool = set(added) | set(ctx.renames.values())
        self.pool = sorted(f for f in pool if f and re.search(r'\.(ts|tsx)$', f) and os.path.exists(f))

    def names(self, path):
        if path not in self.cache:
            try:
                text = open(path).read()
            except OSError:
                text = ''
            found = set(re.findall(r'\bexport\s+(?:declare\s+)?(?:default\s+)?(?:async\s+)?(?:type|interface|const|let|var|function\*?|class|enum|abstract\s+class)\s+([A-Za-z_$][\w$]*)', text))
            for block in re.findall(r'\bexport\s+(?:type\s+)?\{([^}]*)\}', text):
                for part in block.split(','):
                    part = part.strip()
                    if part:
                        found.add(re.split(r'\s+as\s+', part.replace('type ', '', 1))[-1].strip())
            star = bool(re.search(r'\bexport\s+\*\s+from\b', text))
            self.cache[path] = (found, star)
        return self.cache[path]

    def owner(self, name, near):
        hits = [f for f in self.pool if name in self.names(f)[0]]
        if len(hits) > 1:
            same_dir = [f for f in hits if posixpath.dirname(f) == posixpath.dirname(near)]
            hits = same_dir or hits
            hits = [f for f in hits if '.test.' not in f and 'fixture' not in f] or hits
        return hits[0] if len(hits) == 1 else None


def split_text(ctx, exports, text, path):
    file_dir = posixpath.dirname(path)

    def sub(m):
        lead, indent, kw, type_kw, body, q, spec = m.groups()
        t, alias = ctx.target_of(spec, file_dir)
        if t is None:
            return m.group(0)
        mod, ext = ctx.resolve(t, ctx.new_files)
        if mod is None:
            return m.group(0)
        have, star = exports.names(mod)
        if star:
            return m.group(0)
        groups = {}
        moved = False
        for part in [x.strip() for x in body.split(',') if x.strip()]:
            name = re.split(r'\s+as\s+', part.replace('type ', '', 1))[0].strip()
            dest = mod
            if name not in have:
                owner = exports.owner(name, mod)
                if owner:
                    dest, moved = owner, True
            groups.setdefault(dest, []).append(part)
        if not moved:
            return m.group(0)
        out = []
        for dest, parts in groups.items():
            d_ext = next((e for e in EXTS if e and dest.endswith(e)), '')
            new_spec = spec if dest == mod else ctx.respec(dest, d_ext, alias, file_dir)
            out.append(f"{indent}{kw}{type_kw or ''} {{ {', '.join(parts)} }} from {q}{new_spec}{q}")
        return lead + '\n'.join(out)

    return NAMED.sub(sub, text)


def oxfmt(text, path):
    r = subprocess.run(['node_modules/.bin/oxfmt', '--stdin-filepath=' + path], capture_output=True, text=True, input=text)
    return r.stdout if r.returncode == 0 and r.stdout else text


def show(ref, path):
    r = subprocess.run(['git', 'show', f'{ref}:{path}'], capture_output=True, text=True)
    return r.stdout if r.returncode == 0 else ''


def main():
    mode = sys.argv[1]
    if mode == 'rewrite':
        ctx = Ctx(sys.argv[2], sys.argv[3])
        ctx.old_files |= ctx.new_files
        exports = Exports(ctx)
        for f in sys.argv[4:]:
            if not os.path.isfile(f):
                continue
            old = ctx.reverse.get(f, f)
            text = open(f).read()
            out = ctx.rewrite_text(text, old, f, keep_if_resolves=True)
            out = split_text(ctx, exports, out, f)
            if out != text:
                open(f, 'w').write(out)
                print('REWROTE', f)
    elif mode == 'paths':
        ctx = Ctx(sys.argv[2], sys.argv[3])
        token = re.compile(r"[\w@.\-/]+\.(?:tsx?|mts|mjs|cjs|js|json|css|md)\b")

        def sub(m):
            path = m.group(0)
            for prefix in ('', 'src/'):
                old = prefix + path
                new = ctx.renames.get(old)
                if new and not os.path.exists(old) and os.path.exists(new) and new.startswith(prefix):
                    return new[len(prefix):]
            return path

        for f in sys.argv[4:]:
            if not os.path.isfile(f):
                continue
            text = open(f).read()
            out = token.sub(sub, text)
            if out != text:
                open(f, 'w').write(out)
                print('REWROTE', f)
    elif mode == 'merge':
        merge_base, ours_ref, fork = sys.argv[4], sys.argv[5], sys.argv[6]
        ctx = Ctx(sys.argv[2], sys.argv[3], tree_files(fork) | tree_files(merge_base))
        import tempfile
        tmp = tempfile.mkdtemp()
        for f in sys.argv[7:]:
            old = ctx.reverse.get(f, f)
            ours = show(ours_ref, f)
            base = oxfmt(ctx.rewrite_text(show(merge_base, old), old, f, keep_if_resolves=False), f)
            theirs = oxfmt(ctx.rewrite_text(show(fork, old), old, f, keep_if_resolves=False), f)
            paths = []
            for name, text in (('ours', ours), ('base', base), ('theirs', theirs)):
                p = os.path.join(tmp, name)
                open(p, 'w').write(text)
                paths.append(p)
            r = subprocess.run(['git', 'merge-file', '-p', '-L', 'upstream', '-L', 'base', '-L', 'fork', *paths], capture_output=True, text=True)
            os.makedirs(posixpath.dirname(f) or '.', exist_ok=True)
            open(f, 'w').write(r.stdout)
            print(f'{r.returncode} {f}')
    else:
        sys.exit(__doc__)


if __name__ == '__main__':
    main()
