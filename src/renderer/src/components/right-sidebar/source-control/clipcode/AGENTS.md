# ClipCode (fork-only)

The clipboard payload is a wire format shared with the ClipCode IntelliJ plugin (`audichuang/ClipCode`) and VS Code extension (`audichuang/ClipCodeVSCode`). The VS Code extension is the format authority: port build/parse/escape/placeholder/path rules from its `src/clipboardFormat.ts`, `src/restore.ts` and `src/pathResolver.ts` instead of designing them here. A rule only one tool has corrupts real files on cross-tool Paste & Restore (a footer or placeholder written over a source file, a content line dropped).

- `__fixtures__/clipcode-clipboard-contract.json` is a byte copy of the plugin repos' `clipboard-contract.json`. When the plugins change the format, copy the new file and update `EXPECTED_FIXTURES_SHA` in `clipcode-clipboard-format.contract.test.ts`. A stale copy still passes, so check the SHA against `ClipCodeVSCode/test/fixtures/clipboard-contract.json` before trusting a green run.
- This repo asserts only `buildCases` / `parseCases` / `tokenCases`. The fixture's `pathCases` and `restoreCases` are not run here, so restore-plan changes need a manual check against `restore.ts` / `pathResolver.ts` and a real round trip with IntelliJ.
