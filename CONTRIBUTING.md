# Contributing

Receipts is about not making unverified claims, so the same applies here: say what you checked and how. A pull request
that says "tests pass" should say which command, and CI will check it anyway.

## Setup

```
npm ci
npm test            # builds, then runs every test (coverage threshold on packages/core)
node bench/validate.mjs   # proves the benchmark tasks are sound; no model is called
```

Node 20 or newer, and `git` on PATH. The benchmark validation also needs Python 3 with pytest, and Go.

Layout: `packages/core` is the checker (pure TypeScript, no agent-specific code), `packages/cli` holds the `receipts`
and `receipts-hook` binaries and `init`, `adapters/` holds what each agent installs, `bench/` is the benchmark.

Ground rules:
- Never execute anything taken from an agent's message. Build arguments in code, pass them as arrays, no shell. See
  `SECURITY.md`.
- Every verifier result says what it did not check (`note`). Don't ship a verifier that can only say ✅.
- No model in the verification path.

## Add a verifier

A verifier turns one claim type into one of four labels: `VERIFIED`, `CITED`, `CONTRADICTED`, `UNVERIFIED`.

1. **Name the type** in `packages/core/types.ts` (`ClaimType` and `CLAIM_TYPES`).
2. **Declare its required keys** in `packages/core/claims.ts` (`REQUIRED`), and add any new key to `KEYS`. A line
   missing a required key becomes untagged and goes through the scanner, so a parse failure never weakens checking.
3. **Write the verifier** in `packages/core/verifiers/<type>.ts`. It takes `(claim, ctx)` and returns a `Result` via
   `mk(...)` or `unverified(...)` from `verifiers/ctx.ts`:
   - use `search()` for repo searches (it handles ignores, caps, timeouts and the `-e`/`--` safety rules);
   - read files only through `resolveInside()` (`verifiers/code.ts`);
   - check `ctx.deadline` before slow work; a timeout must return `UNVERIFIED` with reason `timeout`;
   - put what the check cannot cover in `note`.
4. **Dispatch it** in `verifyOne()` in `packages/core/check.ts`.
5. **Decide how it blocks.** `policy.ts` blocks on `CONTRADICTED`, strong untagged claims and stale runs. If your
   verifier can be wrong in a way an honest agent cannot avoid, return `UNVERIFIED`, not `CONTRADICTED`.
6. **Tell agents about it** in `skill/SKILL.md` (and the copies under `adapters/*/skills/`; a test checks they match)
   and, only if it is essential, in `rules/RULES.md` (15 lines at most).
7. **Test it** in `packages/core/scenarios.test.ts`: a true claim, a false claim, and the honest edge cases (a claim
   that reports a failure, a scoped claim, a huge or binary file, a non-git folder).

## Add a test-runner parser

Parsers turn a command's output into `{ runner, passed, failed, skipped }`, which is the evidence when the exit code
can't be trusted (for example `npm test | tail`).

1. **Capture real output** from the runner, both passing and failing, and a run that collected zero tests. Save it as
   `test/fixtures/runners/<runner>.txt` (and `<runner>-empty.txt`). Real output, not output written from memory.
2. **Write the parser** in `packages/core/runners/<runner>.ts`: a `Parser` that returns `null` when the output is not
   from this runner. Match the runner's own summary line, take the last occurrence, and strip nothing you don't need
   to: `parseSummary()` already removes ANSI colours.
3. **Register it** in `PARSERS` in `packages/core/runners/index.ts`. Every parser sees every output, so make sure yours
   returns `null` for the other fixtures; the test `runner summaries: one fixture per runner` checks that.
4. **Add the expectation** to that test in `packages/core/units.test.ts`.
5. If the runner has filter flags (run one test, one file), add them to `FILTER_FLAGS` or `detectFilter()` in
   `packages/core/cmd.ts`, so "all tests pass" after a filtered run is reported as a subset.

## Benchmark changes

- Tune the scanner and lexicon on the **dev** tasks only. Never on the test or hold-out tasks.
- New tasks go through `bench/gen/*.py`; run `python3 bench/gen/main.py` and `node bench/validate.mjs`. A task is
  valid only if the trap bites after a plausible partial change and the reference solution passes.
- Runs cost money (`bench/run.mjs` drives real agent sessions). Publish the results whatever they show.
