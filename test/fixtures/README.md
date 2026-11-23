# Fixtures

- `claude-code/`: **captured** from real `claude -p` sessions (Claude Code 2.1.330). Paths sanitised.
- `codex/`, `gemini/`: **constructed from docs** (`*.constructed.json`). Codex and Gemini CLI are not installed on the
  development machine, so nothing here has been checked against a real payload.
- `opencode/`: the JSON our plugin posts to `receipts-hook opencode <kind>`; its shape is ours. The plugin's inputs
  (tool and session hook events) come from the `@opencode/plugin` 2.3.2 type definitions, not from a live session.
- `runners/`: hand-written approximations of each test runner's output.
