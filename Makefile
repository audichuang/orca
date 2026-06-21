# Orca — fast arm64-only local build / install / debug (macOS, personal)
# Builds ONLY for this Mac (Apple Silicon / arm64). Skips x64, web-pairing
# bundle, and typecheck so the loop is fast. `make help` lists everything.

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

.PHONY: help install setup computer-use build app dmg run logs doctor typecheck clean all

help:
	@echo "Orca local build (arm64 only):"
	@echo "  make all        first time: install + native helper + dmg + open it"
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

setup: install
	pnpm run build:computer-macos

# Fast arm64-only build: core JS only (relay + cli + renderer), reuse the
# computer-use helper, NO typecheck, NO web bundle, NO x64, NO dmg.
build: computer-use
	pnpm run build:relay
	pnpm run build:cli
	pnpm run build:electron-vite
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
	pnpm run build:relay
	pnpm run build:cli
	pnpm run build:electron-vite
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
