# Orca — fast arm64-only local build / install / debug (macOS, personal)
# Builds ONLY for this Mac (Apple Silicon / arm64). Skips x64, dmg (unless
# `make dmg`) and typecheck so the loop is fast. `make help` lists everything.

EB_CONFIG    := config/electron-builder.config.cjs
DIST_APP     := dist/mac-arm64/Orca.app
DMG          := dist/orca-macos-arm64.dmg
APP          := /Applications/Orca.app
COMPUTER_USE := native/computer-use-macos/.build/release/Orca Computer Use.app
LOG          := $(HOME)/orca.log
DOCTOR       := $(HOME)/orca-doctor.txt
# Optional reachability probe: make doctor HOST=192.168.31.65 PORT=6768
HOST         ?=
PORT         ?= 6768

.PHONY: help install setup computer-use build app dmg run logs doctor sync update typecheck clean all fork-dmg fork-check fork-check-full fork-ci-disable-upstream fork-check-static fork-check-static-types fork-check-quality fork-check-coverage fork-check-tests fork-check-lint fork-base-guard

help:
	@echo "Orca local build (arm64 only):"
	@echo "  make all        first time: install + native helper + dmg + open it"
	@echo "  make sync       move local main to the fork's main (never 'git pull'; refuses on local work)"
	@echo "  make update     after 'make sync': pnpm install + build + reinstall to /Applications"
	@echo "  make app        FAST: build .app and install straight to /Applications (no dmg)"
	@echo "  make dmg        build the arm64 .dmg and open it (drag-to-Applications flow)"
	@echo "  make build      FAST: build dist/mac-arm64/Orca.app only (no install, no dmg)"
	@echo "  make run        launch the installed app from Terminal: streams logs to $(LOG)"
	@echo "                  + renderer DevTools at http://127.0.0.1:9357"
	@echo "  make logs       tail -f $(LOG)"
	@echo "  make doctor     collect env + app state + network + log into one file to send Claude"
	@echo "                  (add HOST=<server-ip> PORT=<port> to also probe reachability)"
	@echo "  make install    pnpm install"
	@echo "  make setup      install + build the macOS computer-use helper (one-time, slow)"
	@echo "  make typecheck  full type check (optional safety gate)"
	@echo "  make clean      remove dist/ and out/"
	@echo "  make fork-check       after a rebase: typecheck + fork-area tests + quality gate (minutes)"
	@echo "  make fork-check-full  before a release: every test the fork's changes reach + headless e2e"

install:
	pnpm install

# One-time native Swift helper. electron-builder REQUIRES this artifact
# (config extraResources). Slow (~40s+); only needs to run once, then reused.
computer-use:
	@if [ ! -d "$(COMPUTER_USE)" ]; then \
		echo ">> building macOS computer-use helper (one-time)"; \
		pnpm run build:computer-macos; \
	else \
		echo ">> reusing existing computer-use helper"; \
	fi
	@# Small Swift helpers packaging copies into Contents/MacOS (swift build is incremental).
	pnpm run build:keyboard-layout-macos
	pnpm run build:notification-status-macos

setup: install
	pnpm run build:computer-macos

# Fast arm64-only build: build:desktop minus typecheck, reuse the
# computer-use helper, NO x64, NO dmg.
build: computer-use
	@# Same steps as this version's build:desktop, minus typecheck (scripts differ between releases).
	eval "$$(node -p "require('./package.json').scripts['build:desktop'].replace('pnpm run typecheck && ', '')")"
	pnpm run ensure:electron-runtime
	pnpm exec electron-builder --config $(EB_CONFIG) --mac --arm64 --dir

# Fastest install: build the .app and copy it straight into /Applications
# (skips dmg + zip + blockmap + drag). Clears quarantine so it opens directly.
app: build
	@echo ">> installing $(DIST_APP) -> $(APP)"
	@osascript -e 'quit app "Orca"' 2>/dev/null || true
	@sleep 1
	rm -rf "$(APP)"
	cp -R "$(DIST_APP)" "$(APP)"
	@xattr -dr com.apple.quarantine "$(APP)" 2>/dev/null || true
	@echo ">> installed. run it with logs:  make run"

# Build the arm64 .dmg and open it (your drag-to-install flow).
dmg: computer-use
	@# Same steps as this version's build:desktop, minus typecheck (scripts differ between releases).
	eval "$$(node -p "require('./package.json').scripts['build:desktop'].replace('pnpm run typecheck && ', '')")"
	pnpm run ensure:electron-runtime
	pnpm exec electron-builder --config $(EB_CONFIG) --mac --arm64
	open "$(DMG)"

# Launch the INSTALLED app from Terminal so main-process logs stream live and
# get captured to $(LOG); renderer is inspectable in Chrome at :9357.
run:
	@osascript -e 'quit app "Orca"' 2>/dev/null || true
	@sleep 1
	@BIN="$$(ls "$(APP)/Contents/MacOS/" | head -1)"; \
	echo ">> launching $$BIN"; \
	echo ">> logs   -> $(LOG)"; \
	echo ">> devtools/network -> open http://127.0.0.1:9357 in Chrome"; \
	"$(APP)/Contents/MacOS/$$BIN" --remote-debugging-port=9357 2>&1 | tee "$(LOG)"

logs:
	tail -f "$(LOG)"

# After `make sync`: sync deps, rebuild (arm64, fast), reinstall to /Applications.
# Then run it with: make run
update: install app
	@echo ">> updated to $$(git rev-parse --short HEAD). launch with: make run"

# One-shot debug bundle: environment, installed-app state, signing/Gatekeeper,
# local network + reachability to your server, and the tail of $(LOG).
# Usage: make doctor                       (env + log)
#        make doctor HOST=192.168.31.65    (also probes ws server reachability on PORT)
doctor:
	@echo ">> collecting -> $(DOCTOR)"
	@{ \
	  echo "===== Orca doctor ($$(date)) ====="; \
	  echo; echo "## System"; \
	  sw_vers 2>/dev/null || true; \
	  echo "arch:  $$(uname -m)"; \
	  echo "node:  $$(node -v 2>/dev/null)   pnpm: $$(pnpm -v 2>/dev/null)"; \
	  echo; echo "## Repo (build you are running)"; \
	  echo "branch: $$(git rev-parse --abbrev-ref HEAD 2>/dev/null)"; \
	  git --no-pager log --oneline -3 2>/dev/null || true; \
	  echo "dirty:"; git --no-pager status --short 2>/dev/null | head; \
	  echo; echo "## Installed app"; \
	  if [ -d "$(APP)" ]; then \
	    echo "path:    $(APP)"; \
	    echo "version: $$(defaults read "$(APP)/Contents/Info" CFBundleShortVersionString 2>/dev/null) (build $$(defaults read "$(APP)/Contents/Info" CFBundleVersion 2>/dev/null))"; \
	    echo "id:      $$(defaults read "$(APP)/Contents/Info" CFBundleIdentifier 2>/dev/null)"; \
	    echo "binary:  $$(ls "$(APP)/Contents/MacOS/" 2>/dev/null)"; \
	    echo "-- codesign --"; codesign -dv "$(APP)" 2>&1 | head -8; \
	    echo "-- gatekeeper (spctl) --"; spctl -a -vv "$(APP)" 2>&1 | head -4; \
	    echo "-- quarantine --"; xattr -l "$(APP)" 2>/dev/null | head; \
	  else echo "NOT installed at $(APP) (run 'make app')"; fi; \
	  echo; echo "## Network"; \
	  echo "local IPs:"; ifconfig 2>/dev/null | awk '/inet /{print "  "$$2}'; \
	  if [ -n "$(HOST)" ]; then \
	    echo "route to $(HOST):"; route -n get $(HOST) 2>&1 | sed 's/^/  /' | head; \
	    echo "ping $(HOST):"; ping -c 2 -t 3 $(HOST) 2>&1 | tail -3; \
	    echo "tcp $(HOST):$(PORT):"; nc -vz -G 3 $(HOST) $(PORT) 2>&1 | tail -3; \
	  else echo "(pass HOST=<server-ip> PORT=<port> to probe reachability to your remote runtime)"; fi; \
	  echo; echo "## $(LOG) (last 200 lines)"; \
	  if [ -f "$(LOG)" ]; then tail -n 200 "$(LOG)"; else echo "(none yet — run 'make run' to capture app logs first)"; fi; \
	} > "$(DOCTOR)" 2>&1
	@echo ">> done. send me this file:  $(DOCTOR)"
	@echo "   (cat \"$(DOCTOR)\"  or drag it into the chat)"

typecheck:
	pnpm typecheck

clean:
	rm -rf dist out

# First-time full path: deps + native helper + dmg + open.
all: setup dmg

# Fork release dmg (arm64, self-signed, auto-update off). Usage: make fork-dmg FORK_VERSION=1.4.227-fork.1
# The identity's p12 is in 1Password (Agent vault, "Orca Fork Code Signing"); FORK_SIGN_IDENTITY=- builds ad-hoc.
FORK_SIGN_IDENTITY ?= Orca Fork Code Signing
fork-dmg: computer-use
	@test -n "$(FORK_VERSION)" || (echo "FORK_VERSION is required, e.g. 1.4.227-fork.1" && exit 1)
	@test "$(FORK_SIGN_IDENTITY)" = "-" || security find-identity -v -p codesigning | grep -q "\"$(FORK_SIGN_IDENTITY)\"" || \
		(echo "Signing identity '$(FORK_SIGN_IDENTITY)' not in keychain; import it from 1Password or pass FORK_SIGN_IDENTITY=-" && exit 1)
	eval "$$(node -p "require('./package.json').scripts['build:desktop'].replace('pnpm run typecheck && ', '')")"
	pnpm run ensure:electron-runtime
	ORCA_FORK_VERSION=$(FORK_VERSION) ORCA_FORK_SIGN_IDENTITY="$(FORK_SIGN_IDENTITY)" \
		$(if $(filter -,$(FORK_SIGN_IDENTITY)),,CSC_NAME="$(FORK_SIGN_IDENTITY)") pnpm exec electron-builder --config config/electron-builder.fork.config.cjs --mac --arm64

# Upstream release the fork sits on (fork tags excluded). Override: make fork-check FORK_BASE=v1.4.229
FORK_BASE ?= $(shell git describe --tags --abbrev=0 --match 'v[0-9]*' --exclude '*fork*' HEAD)
# Upstream areas the fork edits; their whole suites run because upstream tests there import fork-changed modules.
FORK_TEST_DIRS := src/renderer/src/components/right-sidebar src/renderer/src/components/editor \
  src/renderer/src/store/slices/editor src/renderer/src/store/workspace-layout-git-owner-roundtrip.test.ts \
  src/shared/workspace-layout src/main/git/source-control src/main/providers src/renderer/src/components/tab-bar \
  src/shared/git-history src/main/runtime/rpc/methods/git.test.ts src/main/runtime/runtime-git-api-contract.test.ts \
  src/main/git/history src/renderer/src/components/terminal-pane src/main/ipc/filesystem \
  src/main/runtime/rpc/methods src/main/runtime/runtime-git-status-admission.test.ts src/renderer/src/runtime \
  src/renderer/src/web/preload-api src/shared/workspace-session-schema src/renderer/src/components/sidebar \
  src/main/project-groups src/main/git/status src/main/ipc/pty src/main/runtime/runtime-git src/main/updater src/preload/api/git \
  src/renderer/src/hooks/editor-external-watch src/renderer/src/hooks/useEditorExternalWatch \
  src/renderer/src/lib/remap-open-editor-tabs src/renderer/src/lib/workspace-session src/shared/git-diff \
  src/shared/project-group src/shared/rpc-contract src/shared/workspace-session

# Why the guard: a clone without upstream tags resolves an ancient FORK_BASE and silently runs thousands of unrelated tests.
FORK_MAX_COMMITS ?= 200

# fork-check = fork-check-static + fork-check-tests; CI runs the halves as parallel jobs, tests in FORK_TEST_SHARD slices.
FORK_TEST_SHARD ?=

fork-check: export LC_ALL = C
fork-check: fork-check-coverage fork-check-static-types fork-check-tests fork-check-quality fork-check-lint

fork-check-static: export LC_ALL = C
fork-check-static: fork-check-coverage fork-check-static-types fork-check-quality fork-check-lint

fork-base-guard:
	@echo ">> fork base: $(FORK_BASE)"
	@n=$$(git rev-list --count $(FORK_BASE)..HEAD 2>/dev/null || echo 999999); if [ "$$n" -gt "$(FORK_MAX_COMMITS)" ]; then \
	  echo "fork-check: $(FORK_BASE) is $$n commits behind HEAD; fetch upstream tags (git fetch <upstream-remote> --tags) or pass FORK_BASE=vX.Y.Z"; exit 1; fi

fork-check-static-types: fork-base-guard
	pnpm tc

# Runs first so a missing FORK_TEST_DIRS entry fails before the long test run, not after it.
fork-check-coverage: fork-base-guard
	@# Why: vitest filters by path substring, so an upstream file the fork edits is covered when an entry prefixes its path.
	@missing=$$(for f in $$(git diff --name-only --diff-filter=M $(FORK_BASE) HEAD -- src | grep -vE '\.test\.tsx?$$|/locales/'); do \
	  s=$${f%.*}; for d in $(FORK_TEST_DIRS); do case "$$s" in "$${d%.test.ts}"*) continue 2;; esac; done; echo "  $$f"; done); \
	  if [ -n "$$missing" ]; then echo "fork-check: add these upstream files' paths to FORK_TEST_DIRS:"; echo "$$missing"; exit 1; fi

fork-check-quality: fork-base-guard
	pnpm run check:code-quality:changed $(FORK_BASE)

# Whole-repo checks from upstream's `pnpm lint` that fork edits can break (Tailwind classes, the en catalog, rpc catalog) plus fork locale parity; the rest of it is covered on changed lines by fork-check-quality.
fork-check-lint: fork-base-guard
	pnpm run check:dead-classes
	pnpm run verify:localization-catalogs
	pnpm run verify:localization-extraction
	pnpm run verify:localization-coverage
	pnpm run verify:rpc-params-catalog
	pnpm run check:max-lines-ratchet
	node config/scripts/fork-locale-parity.mjs $(FORK_BASE)

fork-check-tests: export LC_ALL = C
fork-check-tests: fork-base-guard
	pnpm exec vitest run --config config/vitest.config.ts $(if $(FORK_TEST_SHARD),--shard=$(FORK_TEST_SHARD)) $(FORK_TEST_DIRS) \
	  $$(git diff --name-only --diff-filter=AM $(FORK_BASE) HEAD | grep -E '\.test\.tsx?$$' | grep -v '^tests/e2e/')

FORK_REPO ?= audichuang/orca
# The fork's remote in this clone, whatever it is named (origin on a plain clone of the fork).
FORK_REMOTE ?= $(shell git remote -v | awk -v r="$(FORK_REPO)" '$$3 == "(fetch)" && $$2 ~ ("[:/]" r "(\\.git)?$$") {print $$1; exit}')

# main is force-moved on release, so git pull would merge two histories; local main must be a value the fork's main once had (clone writes no reflog, so the pre-fetch value counts too).
sync:
	@r="$(FORK_REMOTE)"; \
	test -n "$$r" || { echo "sync: no remote points at $(FORK_REPO); pass FORK_REMOTE=<name>"; exit 1; }; \
	test -z "$$(git status --porcelain -uno)" || { echo "sync: commit or discard these tracked changes first:"; git status -s -uno; exit 1; }; \
	seen=$$(git rev-parse -q --verify "refs/remotes/$$r/main"); \
	git fetch "$$r" "+refs/heads/main:refs/remotes/$$r/main" || exit 1; \
	if git rev-parse -q --verify refs/heads/main >/dev/null; then \
	  cands=$$(git rev-list -g "refs/remotes/$$r/main") || exit 1; \
	  extra=$$(git rev-list -1 main --not $$seen $$cands --) || exit 1; \
	  test -z "$$extra" || { echo "sync: local main has commits $$r/main never had; push or branch them first"; exit 1; }; \
	fi; \
	echo ">> main was $$(git rev-parse --short main 2>/dev/null) (git reflog keeps it)"; \
	git checkout --no-overwrite-ignore -B main "refs/remotes/$$r/main" && \
	echo ">> main is now $$(git rev-parse --short HEAD). next: make update"
# Fork CI is fork-pr.yml only (macOS arm64 is the only target); rerun after a rebase brings new upstream workflows.
fork-ci-disable-upstream:
	gh workflow list -R $(FORK_REPO) --all --limit 500 --json path,state \
	  --jq '.[] | select(.state == "active" and .path != ".github/workflows/fork-pr.yml") | .path' | \
	  while read -r wf; do gh workflow disable "$${wf##*/}" -R $(FORK_REPO); done

fork-check-full: export LC_ALL = C
fork-check-full: fork-check
	pnpm exec vitest run --config config/vitest.config.ts --changed $(FORK_BASE)
	ORCA_BACKGROUND_LAUNCH=1 pnpm run ensure:electron-runtime
	ORCA_BACKGROUND_LAUNCH=1 npx playwright test tests/e2e/folder-multi-repo-source-control.spec.ts \
	  --config tests/playwright.config.ts --project=electron-headless --workers=1
