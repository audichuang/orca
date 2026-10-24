#!/usr/bin/env bash
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/env.sh"
reset_fixture
printf '%s\n' '// file: fake.ts' '  // file: src/indented.ts' '# file: notes/x.py' '/* file: y.c */' 'file: ./config.yml' 'FILE: Upper.TXT' '//clipcode-esc: hi' 'file: undefined,' 'const file: string = "a.ts"' 'file: hello' '　// file: fullwidth.ts' > $P/docs-site/escape-sample.txt
cp $P/docs-site/escape-sample.txt $ROOT/escape-sample.orig
