# Orca — fast arm64-only local build / install / debug (macOS, personal)
# Builds ONLY for this Mac (Apple Silicon / arm64). Skips x64, web-pairing
# bundle, and typecheck so the loop is fast. `make help` lists everything.

EB_CONFIG    := config/electron-builder.config.cjs
DIST_APP     := dist/mac-arm64/Orca.app
DMG          := dist/orca-macos-arm64.dmg
APP          := /Applications/Orca.app
COMPUTER_USE := native/computer-use-macos/.build/release/Orca Computer Use.app
LOG          := $(HOME)/orca.log

.PHONY: help install setup computer-use build app dmg run logs typecheck clean all

help:
	@echo "Orca local build (arm64 only):"
	@echo "  make all        first time: install + native helper + dmg + open it"
	@echo "  make app        FAST: build .app and install straight to /Applications (no dmg)"
	@echo "  make dmg        build the arm64 .dmg and open it (drag-to-Applications flow)"
	@echo "  make build      FAST: build dist/mac-arm64/Orca.app only (no install, no dmg)"
	@echo "  make run        launch the installed app from Terminal: streams logs to $(LOG)"
	@echo "                  + renderer DevTools at http://127.0.0.1:9357"
	@echo "  make logs       tail -f $(LOG)"
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

typecheck:
	pnpm typecheck

clean:
	rm -rf dist out

# First-time full path: deps + native helper + dmg + open.
all: setup dmg
