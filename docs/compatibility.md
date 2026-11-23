# Compatibility (as of Milestone 3)

"Real" = exercised in a live agent session. "Contract" = the 11 scenarios run through our hook handlers with payloads constructed from docs; this proves our logic, **not** that the agent behaves as assumed.

| Agent | Real sessions | Contract (11 scenarios) | Can block | Exit code for ledger | User sees report | Rules reach the model |
| --- | --- | --- | --- | --- | --- | --- |
| Claude Code 2.1.330 | **Yes**, 10 pass + 1 caught-not-cleared (`test/e2e/`) | pass | Yes (`decision: block`) | Yes: `PostToolUseFailure` `error` text; success implies 0 | in the event stream; TUI rendering not checked | `SessionStart` `additionalContext` (verified) |
| Codex CLI | **No** (not installed) | pass | Yes per docs (`decision: block`) | Not documented; parsed from text if present, else summary only | `systemMessage` per docs | `SessionStart` `additionalContext` per docs |
| Gemini CLI | **No** (not installed; docs say superseded) | pass | Yes per docs (`decision: deny` forces a retry) | Parsed from `llmContent` "Exit Code" (unverified format) | `systemMessage` per docs | `SessionStart` `additionalContext` per docs |
| OpenCode 2.2.0 | **No** (live run not permitted) | pass (plugin logic, mock context) | Probably: synthetic message in `experimental.idle` continues the turn (types say so; Experimental) | Not documented; `null` unless metadata carries it | **No channel** (report file only) | `AGENTS.md` block |

Scenario notes: scenario 2 on Codex, Gemini and OpenCode relies on the parsed test summary when the exit code is unknown. Scenario 3 on node:test cannot be detected from the summary (each test file counts as a test).
