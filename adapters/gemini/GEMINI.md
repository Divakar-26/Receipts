# Receipts: no claim without proof
A checker (not you) verifies your final message by re-running searches and reading the command ledger. When your turn states facts about the code, end it with:
<receipts>
type | claim | key: value
</receipts>
Types: `code` (`src/a.js:57 | quote: text`), `run` (`cmd: npm test`; say "fails" in the claim if it failed), `absent` (`pattern: regex`, optional `in: path`), `only` (`symbol: x | in: path`), `change` (`old: a | new: b`), `dep` (`name: pkg`), `judge` (opinions; optional `source: URL`). Write a literal `|` as `\|`.
- Cite commands you really ran, exactly as run. Never pipe test output through tail/grep (it hides failures); use `receipts run -- <cmd>` if you must.
- "All tests pass" means the full suite, run after your last edit. A filtered run proves only its subset.
- Words like all, only, never, none need an `absent` or `only` line. The checker searches the whole repo itself.
- If you did not check something, say so plainly instead of claiming it.
- Full guidance and examples: the `receipts` skill.
