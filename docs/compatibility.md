# Compatibility

"Real sessions" means exercised inside the agent itself. "Contract" means the 11 standard scenarios run through
Receipts' hook handlers with payloads shaped like the agent's; that proves Receipts' logic, not the agent's behaviour.

| | Claude Code | Codex CLI | Gemini CLI | OpenCode |
| --- | --- | --- | --- | --- |
| install | plugin (`/plugin install receipts@receipts`) or `receipts init` | plugin (`codex plugin add receipts@receipts`, then `/hooks` trust) or `init` | extension from `adapters/gemini`, or `init` | `init` writes `.opencode/plugins/receipts.js` + `AGENTS.md` block |
| install tested | yes, local marketplace, project-local scope | yes, local marketplace, scratch `CODEX_HOME` | stops at Gemini's folder-trust prompt (not answered for you) | `init` tested; plugin load not tested live |
| payloads | captured from real sessions (2.1.330) | validated against the JSON Schemas embedded in codex 0.171.0 | from the 0.70.0 docs and shell-tool source | from the `@opencode/plugin` 2.3.2 type definitions |
| rules reach the model | `SessionStart` `additionalContext` (verified) | `SessionStart` `additionalContext` | `SessionStart` `additionalContext` | `AGENTS.md` block |
| can send the agent back | yes (`decision: block`) | yes (`decision: block`) | yes (`decision: deny` forces a retry turn) | probably: a synthetic message in the experimental idle hook continues the turn |
| shell exit codes | yes (failures arrive as `PostToolUseFailure`) | no: `tool_response` is untyped; parsed test summary is the evidence | yes: the shell tool prints `Exit Code` only when non-zero | no field documented |
| report shown to the user | `systemMessage` (seen in the event stream; UI rendering not confirmed by a person) | `systemMessage` | `systemMessage` | none: `.receipts/last-report.md` only |
| real sessions | 11 scenarios (10 pass, 1 caught but not cleared in the last run) and the benchmark | none | none | none |
| contract (11 scenarios) | pass | pass | pass | pass (plugin logic with a mock context) |

Platforms: the test suite passes on Ubuntu, macOS and Windows with Node 20 and 22 (GitHub Actions), and on Node 24
locally.

Known limits per agent:
- **Codex:** hooks run only after you trust them with `/hooks`; a changed hook must be trusted again.
- **Gemini CLI:** project hooks are fingerprinted, and changing one makes it untrusted. Gemini CLI's docs say it was
  superseded by Antigravity CLI.
- **OpenCode:** no report in the UI; the idle hook is experimental and has not been run live.
- **node:test:** a test file that defines no tests is reported by node as one passing test; Receipts subtracts those
  entries, so "no tests executed" is still detected.
