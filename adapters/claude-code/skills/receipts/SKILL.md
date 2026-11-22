---
name: receipts
description: Use when you finish a turn that states facts about code, tests, dependencies or docs. Explains the <receipts> claim block that the Receipts checker verifies, with examples of every claim type.
---

# Receipts: how to make claims the checker can verify

Receipts reads your final message, finds factual claims about the code, and checks each
one with plain code (search, file reads, git state, a log of commands that really ran).
It never asks a model. You do not grade your own work; you give the checker something to check.

## The block

End the turn with one block, one line per claim. Only the last block counts.

```
<receipts>
type | claim text | key: value | key: value
</receipts>
```

A literal `|` inside any part is written `\|`. A line that does not parse is still scanned
as free text, so a malformed line never lowers the level of checking.

## Claim types

| type | write | the checker does | best result |
| --- | --- | --- | --- |
| `code` | `code \| claim \| src/a.js:57 \| quote: return null` | opens the file, finds the quote within 3 lines of that line | 📎 cited (it does not judge what the line means) |
| `run` | `run \| claim \| cmd: npm test` | finds the latest matching command this session, its exit code, parsed test counts, whether files changed since | ✅ |
| `absent` | `absent \| claim \| pattern: console\.log` | greps the WHOLE repo itself, whatever scope you named | ✅ zero hits |
| `only` | `only \| claim \| symbol: verifyToken \| in: src/login.js` | greps the whole repo for the symbol outside `in:` and the definition | ✅ |
| `change` | `change \| claim \| old: getUser \| new: fetchUser` | old name gone, new name present | ✅ |
| `dep` | `dep \| claim \| name: bcrypt` (optional `version:`) | reads manifests and lockfiles | ✅ "declared" |
| `judge` | `judge \| claim` (optional `source: URL`) | cannot prove it; lists the evidence that exists | ⚠️ always |

## Good examples

```
<receipts>
code   | expired token returns null              | src/auth.js:57 | quote: return null
run    | full test suite passes                  | cmd: npm test
absent | no console.log left in the repo         | pattern: console\.log
</receipts>
```
Each claim names its proof. The `run` line cites the exact command, and the suite was run
after the last edit.

```
<receipts>
only   | verifyToken is only called from login   | symbol: verifyToken | in: src/login.js
change | renamed getUser to fetchUser everywhere | old: getUser | new: fetchUser
dep    | bcrypt is a dependency                  | name: bcrypt
</receipts>
```
"Only" and "everywhere" are universal claims. They get `only` and `change` lines so the
checker can look at the whole repo.

```
<receipts>
judge  | Next 15 doesn't cache fetch by default  | source: https://nextjs.org/docs/app/api-reference/functions/fetch
judge  | this change won't affect other callers
</receipts>
```
Opinions are honest as `judge`. They stay ⚠️ unverified, and the report lists related evidence
(was the source fetched? did tests run?). A `source:` only helps if you actually fetched it.

## Bad examples (what gets blocked)

```
I ran the login tests and all tests pass.
<receipts>
run | all tests pass | cmd: npm test -- login
</receipts>
```
Wrong: a filtered run proves only the subset. Run the full suite, or write "login tests pass".

```
<receipts>
code | verifyToken is only called from login.js | src/login.js:12 | quote: verifyToken(t)
</receipts>
```
Wrong: one cited line cannot prove "only". The checker re-types it as an `only` claim and
searches the whole repo. Write an `only` line with `symbol:` and `in:`.

## Rules of thumb

- Do not run tests as `npm test | tail`. The pipe hides the exit code. Run it plain, or use
  `receipts run -- npm test`, which records the real exit code.
- Edits after a test run make that run stale. Re-run before claiming it passes.
- Say plainly what you did not check. An honest ⚠️ costs nothing; a false ✅ gets caught.
- If the checker sends you back, fix the claim or withdraw it. It only does this once per turn.
- Turns with no factual claims (plans, questions) need no block.
