# Security model

Receipts reads an AI agent's message and checks it. The message is **untrusted input**: an agent can be wrong,
confused, or steered by text in the repo it is working on. Everything below follows from that.

## What the checker will and will not execute

- **It never executes a string from the agent's message.** It runs only its own fixed programs: ripgrep (from
  `@vscode/ripgrep`), `git grep` as a fallback, and `git` for snapshots. Arguments are built by code and passed as
  arrays to `execFile`. No shell is involved.
- **Agent-supplied patterns cannot become flags.** A pattern is always passed as the value of `-e`, and paths come
  after `--`, so a pattern such as `--pre=evil` is searched for, not obeyed (`packages/core/search.ts`). `rg -P` is
  never used; the default engine runs in linear time, so a hostile regex cannot cause catastrophic backtracking.
- **Searches are capped:** result count, `--max-filesize 1M`, `--max-columns 400`, and a timeout derived from the
  10-second check budget. A check that runs out of time reports `timeout` and never blocks.
- **Files are read only inside the repo root.** `code` claims resolve the path, refuse `..` escapes, and resolve
  symlinks before reading, refusing any that leave the root (`packages/core/verifiers/code.ts`). Files over 5 MB and
  binary files are not read.
- **The ledger stores the last 40 lines of a command's output, with secret patterns redacted**, never the full
  output (`packages/core/ledger.ts`: AWS keys, GitHub/Slack/API tokens, JWTs, bearer tokens, `password=`-style
  assignments, private keys, credentials in URLs). Redaction is pattern-based and can miss secrets in an unusual
  format, so the `.receipts/` folder is added to `.gitignore` by `receipts init`.

`receipts run -- <cmd>` is the one place that runs a command chosen by the agent. It is a wrapper the agent calls
deliberately, exactly as it would run the command in its own shell, and it exists only to record the real exit code.

## What runs, and who approves it

Receipts runs as hooks inside your agent. Each agent has its own approval step:

| agent | where the hooks live | approval |
| --- | --- | --- |
| Claude Code | `.claude/settings.json` (project) or the plugin's `hooks/hooks.json` | project settings apply to that project; plugins are installed by you with `/plugin install` |
| Codex CLI | `.codex/hooks.json` or the plugin's `hooks/hooks.json` | **you must review and trust each hook with `/hooks`** before it runs; a changed hook is skipped until trusted again |
| Gemini CLI | `.gemini/settings.json` or the extension's `hooks/hooks.json` | the workspace must be trusted; project hooks are fingerprinted, and a changed hook is treated as new and untrusted |
| OpenCode | `.opencode/plugins/receipts.js` | plugins in the project folder are loaded by OpenCode; review the file before use |

The hooks run `node` on files from the installed `@receipts/cli` package. `receipts init` prints every file it
changes, and `receipts uninstall` reverses them.

## Network and data

No network calls, no telemetry, no accounts. All state stays in the project's `.receipts/` folder: the command
ledger, per-session retry counters, the last report, and a hook log.

## What Receipts is not

It is not a sandbox and not a security scanner. It checks whether claims match evidence; it does not stop an agent
from running commands, and a `judge` claim such as "this is secure" is always reported as unverified.

## Reporting a vulnerability

Please open a private security advisory on the GitHub repository rather than a public issue.
