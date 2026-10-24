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

.PHONY: help install setup computer-use build app dmg run logs doctor sync update typecheck clean all fork-dmg fork-check fork-check-full fork-ci-disable-upstream fork-check-static fork-check-static-types fork-check-quality fork-check-tests fork-check-lint fork-check-e2e fork-check-wire fork-check-mobile fork-base-guard fork-footprint fork-check-seams fork-canary

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
	@echo "  make fork-check       after a rebase: typecheck + tests the fork's changes reach + lint + quality gate"
	@echo "  make fork-check-e2e   the fork's headless e2e specs (CI runs it on every PR)"
	@echo "  make fork-check-full  before pushing: every fork CI job but the full unit suite and the macOS build"
	@echo "  make fork-check-seams the fork seam contract tests in config/fork-seam-tests.txt"
	@echo "  make fork-footprint   the fork's diff on upstream files since FORK_BASE (JSON=1 for --json)"
	@echo "  make fork-canary      report-only: merge the fork into upstream main, typecheck, run fork tests"

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

# Fork release dmg (arm64, auto-update off). Usage: make fork-dmg FORK_VERSION=1.4.227-fork.1
# Local default is the self-signed identity (1Password Agent vault, "Orca Fork Code Signing"); FORK_SIGN_IDENTITY=- builds ad-hoc.
# A "Developer ID Application:" identity (fork-release.yml) turns on hardened runtime + notarization,
# which needs APPLE_API_KEY / APPLE_API_KEY_ID / APPLE_API_ISSUER.
FORK_SIGN_IDENTITY ?= Orca Fork Code Signing
FORK_TEAM_ID ?= 37HFR5V2JJ
FORK_RELEASE_ENV = $(if $(findstring Developer ID Application:,$(FORK_SIGN_IDENTITY)),ORCA_MAC_RELEASE=1 ORCA_MAC_TEAM_ID=$(FORK_TEAM_ID))
# Why: electron-builder rejects the "Developer ID Application: " prefix; codesign matches the rest.
FORK_SIGN_NAME = $(subst Developer ID Application: ,,$(FORK_SIGN_IDENTITY))
fork-dmg: computer-use
	@test -n "$(FORK_VERSION)" || (echo "FORK_VERSION is required, e.g. 1.4.227-fork.1" && exit 1)
	@test "$(FORK_SIGN_IDENTITY)" = "-" || security find-identity -v -p codesigning | grep -q "\"$(FORK_SIGN_IDENTITY)\"" || \
		(echo "Signing identity '$(FORK_SIGN_IDENTITY)' not in keychain; import it from 1Password or pass FORK_SIGN_IDENTITY=-" && exit 1)
	eval "$$(node -p "require('./package.json').scripts['build:desktop'].replace('pnpm run typecheck && ', '')")"
	pnpm run ensure:electron-runtime
	ORCA_FORK_VERSION=$(FORK_VERSION) ORCA_FORK_SIGN_IDENTITY="$(FORK_SIGN_NAME)" $(FORK_RELEASE_ENV) \
		$(if $(filter -,$(FORK_SIGN_IDENTITY)),,CSC_NAME="$(FORK_SIGN_NAME)") pnpm exec electron-builder --config config/electron-builder.fork.config.cjs --mac --arm64
	node config/scripts/fork-verify-packaged-files.cjs dist/mac-arm64/Orca.app/Contents/Resources/app.asar

# Upstream release the fork sits on (fork tags excluded). Override: make fork-check FORK_BASE=v1.4.229
FORK_BASE ?= $(shell git describe --tags --abbrev=0 --match 'v[0-9]*' --exclude '*fork*' HEAD)
# Why: resolve once; a recursive ?= reruns git describe on every reference.
FORK_BASE := $(FORK_BASE)
# Why the guard: a clone without upstream tags resolves an ancient FORK_BASE and silently runs thousands of unrelated tests.
# Why 400: fork work alone passed 200 commits on v1.4.237; an ancient base is thousands behind.
FORK_MAX_COMMITS ?= 400

# fork-check = fork-check-static + fork-check-tests; CI runs the halves as parallel jobs, tests in FORK_TEST_SHARD slices.
FORK_TEST_SHARD ?=
# all: upstream CI's full unit suite; empty: the fast local --changed pre-check.
FORK_TESTS ?=

fork-check: export LC_ALL = C
fork-check: fork-check-static fork-check-tests

fork-check-static: export LC_ALL = C
fork-check-static: fork-check-static-types fork-check-quality fork-check-lint

fork-base-guard:
	@echo ">> fork base: $(FORK_BASE)"
	@# Why: an empty FORK_BASE makes the count below `..HEAD`, which is 0 and passes.
	@test -n "$(FORK_BASE)" || { echo "fork-check: FORK_BASE is empty (no upstream vX.Y.Z tag reachable from HEAD); fetch upstream tags (git fetch <upstream-remote> --tags) or pass FORK_BASE=vX.Y.Z"; exit 1; }
	@case '$(FORK_BASE)' in -*|*[!A-Za-z0-9._/~^-]*) echo "fork-check: FORK_BASE must be one tag or commit, not '$(FORK_BASE)'"; exit 1;; esac
	@n=$$(git rev-list --count $(FORK_BASE)..HEAD 2>/dev/null || echo 999999); if [ "$$n" -gt "$(FORK_MAX_COMMITS)" ]; then \
	  echo "fork-check: $(FORK_BASE) is $$n commits behind HEAD; fetch upstream tags (git fetch <upstream-remote> --tags) or pass FORK_BASE=vX.Y.Z"; exit 1; fi

fork-check-static-types: fork-base-guard
	pnpm tc

fork-check-quality: fork-base-guard
	pnpm run check:code-quality:changed $(FORK_BASE)

# Upstream's `pnpm lint` steps minus fork-lint-run.mjs's EXCLUDED, then the fork-only checks.
fork-check-lint: fork-base-guard
	node config/scripts/fork-lint-run.mjs
	node config/scripts/fork-pr-gate-needs.mjs
	node config/scripts/fork-locale-parity.mjs $(FORK_BASE)
	node config/scripts/fork-seam-tests.mjs --check
	@# Why here too: a branch goes red in CI once upstream releases a daemon protocol bump.
	pnpm run check:daemon-protocol-crossing

fork-check-tests: export LC_ALL = C
# Why: upstream CI's env; it applies UNIT_EXCLUDE, balances shards by timing, and some tests assert background launch.
fork-check-tests: export ORCA_BALANCE_UNIT_SHARDS = 1
fork-check-tests: export ORCA_BACKGROUND_LAUNCH = 1
# Why no guard for all: the full suite needs no FORK_BASE, so CI can use upstream's shallow checkout.
fork-check-tests: $(if $(filter all,$(FORK_TESTS)),,fork-base-guard)
	@test -z "$(FORK_TESTS)" -o "$(FORK_TESTS)" = all || { echo "fork-check-tests: FORK_TESTS must be empty or all, not $(FORK_TESTS)"; exit 1; }
	@# Why: fork-check-e2e leaves Electron-built native modules behind, which vitest cannot load.
	node config/scripts/ensure-native-runtime.mjs --runtime=node
ifeq ($(FORK_TESTS),all)
	node config/scripts/run-vitest.mjs run --config config/vitest.config.ts $(if $(FORK_TEST_SHARD),--shard=$(FORK_TEST_SHARD))
else
	pnpm exec vitest run --config config/vitest.config.ts $(if $(FORK_TEST_SHARD),--shard=$(FORK_TEST_SHARD)) --changed $(FORK_BASE)
endif

fork-footprint:
	@# Why stderr: the guard's echo would corrupt the --json output.
	@$(MAKE) --no-print-directory fork-base-guard >&2
	@node config/scripts/fork-footprint.mjs $(FORK_BASE) $(if $(JSON),--json)

fork-check-seams: export LC_ALL = C
fork-check-seams: export ORCA_BACKGROUND_LAUNCH = 1
fork-check-seams:
	node config/scripts/ensure-native-runtime.mjs --runtime=node
	@# Why not a pipe: the list check's failure must stop the run instead of running fewer files.
	files=$$(node config/scripts/fork-seam-tests.mjs) && pnpm exec vitest run --config config/vitest.config.ts $$files

# Report-only early warning against upstream main; exit 0 green, 1 failures, 2 conflicts. See fork-canary.sh for overrides.
fork-canary: export LC_ALL = C
fork-canary: fork-base-guard
	FORK_BASE=$(FORK_BASE) bash config/scripts/fork-canary.sh

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
# Fork CI is the fork-*.yml workflows only (macOS arm64 is the only target); rerun after a rebase brings new upstream workflows.
fork-ci-disable-upstream:
	gh workflow list -R $(FORK_REPO) --all --limit 500 --json path,state \
	  --jq '.[] | select(.state == "active" and (.path | startswith(".github/workflows/fork-") | not)) | .path' | \
	  while read -r wf; do gh workflow disable "$${wf##*/}" -R $(FORK_REPO); done

# Everything fork CI runs except the full unit suite and the macOS build, so a push rarely goes red.
fork-check-full: export LC_ALL = C
fork-check-full:
	@# Why sub-makes in turn: as -j prerequisites, the Electron native rebuild would race the vitest runs.
	@# Why past failures: macOS fails upstream unit tests, which must not hide what e2e, wire and mobile find.
	@failed=; for step in fork-check-static fork-check-tests fork-check-e2e fork-check-wire fork-check-mobile; do \
	  $(MAKE) $$step || failed="$$failed $$step"; \
	done; \
	test -z "$$failed" || { echo "fork-check-full: failed:$$failed"; exit 1; }

# CI's cross-version wire journeys: old/new clients and servers talking to each other.
# Why skip one file: at the fork base this upstream test reads isStructuredTab from a module that no longer exports it.
# Explicit paths, because a directory filter overrides --exclude; find keeps new files in.
fork-check-wire: export LC_ALL = C
# Why the guard: the journeys pick their baseline from the newest local vX.Y.Z tag.
fork-check-wire: fork-base-guard
	node config/scripts/ensure-native-runtime.mjs --runtime=node
	$(if $(CI),,node config/scripts/fork-wait-for-quiet-machine.mjs)
	pnpm exec vitest run --config config/vitest.config.ts $$(find tests/e2e/cross-version-wire -name '*.test.ts' ! -name 'cross-version-registered-agents.unit.test.ts' | sort)

# CI's mobile web app checks; fork-check-tests skips these without mobile/node_modules.
fork-check-mobile: export LC_ALL = C
fork-check-mobile: MOBILE_ROUTES = $(CURDIR)/out/fork-check-mobile-routes.json
fork-check-mobile:
	@# Why not on CI: the job's install-mobile-dependencies step already installed and checked the lockfile.
	$(if $(CI),,cd mobile && pnpm install --frozen-lockfile && git diff --exit-code -- package.json pnpm-lock.yaml pnpm-workspace.yaml)
	@# The drawer check also runs on WebKit, the engine of the shell's iOS WebView.
	pnpm exec playwright-core install $(if $(CI),--with-deps) webkit
	mkdir -p out && node config/scripts/run-mobile-web-app-checks.mjs --prepare-route-snapshot "$(MOBILE_ROUTES)"
	pnpm run build:mobile-web
	@# Why fail instead of skip: without a browser the render checks skip silently.
	@chrome=$${ORCA_MOBILE_WEB_RENDER_BROWSER:-$$(command -v google-chrome || command -v google-chrome-stable || command -v "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")}; \
	  test -n "$$chrome" || { echo "fork-check-mobile: no Google Chrome; the render check would silently skip"; exit 1; }; \
	  "$$chrome" --version && \
	  ORCA_MOBILE_WEB_APP_DEPS_REQUIRED=1 ORCA_MOBILE_WEB_PREPARED_ROUTE_SNAPSHOT="$(MOBILE_ROUTES)" ORCA_MOBILE_WEB_RENDER_BROWSER="$$chrome" \
	    node config/scripts/run-mobile-web-app-checks.mjs

# The folder multi-repo e2e plus every spec the fork added or changed since FORK_BASE.
fork-check-e2e: export LC_ALL = C
fork-check-e2e: export ORCA_BACKGROUND_LAUNCH = 1
fork-check-e2e: fork-base-guard
	pnpm run ensure:electron-runtime
	$(if $(CI),,node config/scripts/fork-wait-for-quiet-machine.mjs)
	@# Why the diff alone: piped into sort its failure was lost; --no-renames avoids blob fetches in a blob:none clone.
	changed=$$(git diff --name-only --no-renames --diff-filter=d $(FORK_BASE) HEAD -- 'tests/e2e/*.spec.ts') && \
	  specs=$$(printf '%s\n' tests/e2e/folder-multi-repo-source-control.spec.ts $$changed | sort -u) && \
	  for spec in $$specs; do \
	    case "$$spec" in *[!A-Za-z0-9._/-]*) echo "fork-check-e2e: rename $$spec; playwright reads spec arguments as regexes"; exit 1;; esac; \
	    test -f "$$spec" || { echo "fork-check-e2e: $$spec is missing; playwright would skip it silently"; exit 1; }; \
	  done && \
	  echo ">> fork e2e specs:" $$specs && \
	  npx playwright test $$specs --config tests/playwright.config.ts --project=electron-headless --workers=1
