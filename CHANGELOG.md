# Changelog

## Unreleased

- A quoted glob in a test command (`node --test "test/**/*.test.ts"`) is no longer read as a single test file, so it
  doesn't count as running only part of the suite.
- `receipts run` unwrapping also recognises `npx @divakar-26/receipts run`.
- Benchmark: all 180 test-set runs are done; see `bench/README.md`.

## 0.1.0 (2026-11-23)

First release.

- `receipts check`, `run`, `report`, `init`, `uninstall`.
- Seven claim types (`code`, `run`, `absent`, `only`, `change`, `dep`, `judge`), each verified by deterministic code:
  ripgrep or `git grep`, tree-sitter for JS/TS/Python/Go/Java, git snapshots and a ledger of commands that really ran.
- A scanner for claims written in prose. Test-pass, rename, absence and dependency claims in prose are checked by the
  checker itself; other universal claims without a receipt are reported.
- Test summaries parsed for jest, vitest, mocha, node:test, pytest, unittest, go test, cargo test, Maven/Gradle,
  RSpec and PHPUnit.
- Adapters for Claude Code (plugin and project hooks), Codex CLI (plugin and project hooks), Gemini CLI (extension and
  project hooks) and OpenCode (plugin).
- Default mode `warn`: problems are reported, the agent is not sent back. `block` and `strict` are opt-in. The
  benchmark in `bench/` measured a 100% false-block rate for `block` before the fixes in this release; see
  `bench/README.md`.
- A benchmark: 30 test tasks, 6 dev tasks and 6 hold-out tasks over TypeScript, Python and Go fixtures, validated
  without any model, with a deterministic scorer.
