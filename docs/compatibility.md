# Compatibility (as of Milestone 3)

"Real" = exercised in a live agent session. "Contract" = the 11 scenarios run through our hook handlers with payloads constructed from docs; this proves our logic, **not** that the agent behaves as assumed.

| Agent | Real sessions | Contract (11 scenarios) | Can block | Exit code for ledger | User sees report | Rules reach the model |
| --- | --- | --- | --- | --- | --- | --- |
| Claude Code 2.1.330 | **Yes**, 10 pass + 1 caught-not-cleared (`test/e2e/`) | pass | Yes (`decision: block`) | Yes: `PostToolUseFailure` `error` text; success implies 0 | in the event stream; TUI rendering not checked | `SessionStart` `additionalContext` (verified) |
| Codex CLI | **No live run.** Input/output contract **validated against the JSON Schemas embedded in codex 0.171.0** | pass | Yes (`decision: block`, schema-validated) | Not in the schema (`tool_response` is untyped); parsed from text if present, else summary only | `systemMessage` (schema-validated) | `SessionStart` `additionalContext` (schema-validated) |
| Gemini CLI | **No live run.** Hook contract and shell output format **checked against the 0.70.0 bundled docs and source** (docs say it was superseded) | pass | Yes (`decision: deny` forces a retry; documented) | Parsed from `llmContent`; `Exit Code` is printed only when non-zero (source-verified) | `systemMessage` (documented) | `SessionStart` `additionalContext` (documented) |
| OpenCode 2.2.0 | **No** (live run not permitted) | pass (plugin logic, mock context) | Probably: synthetic message in `experimental.idle` continues the turn (types say so; Experimental) | Not documented; `null` unless metadata carries it | **No channel** (report file only) | `AGENTS.md` block |

Scenario notes: scenario 2 on Codex, Gemini and OpenCode relies on the parsed test summary when the exit code is unknown. Scenario 3 on node:test cannot be detected from the summary (each test file counts as a test).
