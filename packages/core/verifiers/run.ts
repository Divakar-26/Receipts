import { Claim, LedgerEntry, LedgerShell, Result } from '../types.js';
import { analyseCommand, detectFilter, isBuildCmd, isTestCmd, normaliseSegment, runnerKey, SegmentInfo } from '../cmd.js';
import { Ctx, mk, unverified } from './ctx.js';

const WHOLE_RE = /\b(all|full|whole|entire|every|complete)\b/i;
const BARE_RE = /^\s*(?:the\s+)?(?:unit\s+|integration\s+)?(?:tests?|test suite|suite)\s+(?:all\s+)?(?:pass|passes|passed|passing|green|are green|succeed|succeeds)/i;
export const isWholeSuiteClaim = (text: string): boolean => (WHOLE_RE.test(text) && /\b(tests?|suite|specs?|checks?)\b/i.test(text)) || BARE_RE.test(text);

function targetOf(cmd: string): string {
  const segs = analyseCommand(cmd);
  if (!segs.length) return '';
  for (let i = segs.length - 1; i >= 0; i--) if (isTestCmd(segs[i].norm) || isBuildCmd(segs[i].norm)) return segs[i].norm;
  return segs[segs.length - 1].norm;
}

function matchingSegment(entry: LedgerShell, target: string): SegmentInfo | null {
  return analyseCommand(entry.cmd).find((s) => s.norm === target) ?? null;
}

export function latestRun(entries: LedgerEntry[], cmd: string): LedgerShell | null {
  const target = targetOf(cmd);
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (e.kind === 'shell' && matchingSegment(e, target)) return e;
  }
  return null;
}

/** "2 failed 3 passed", "make test fails", "it panics": the claim reports a failure, not a pass. */
const FAILURE_RE = /\b(fail(s|ed|ing|ure|ures)?|errors?|errored|broken|breaks|panic(s|ked)?|crash(es|ed)?|red|not (all )?(the )?(tests? )?pass(ing|es|ed)?|(doesn't|don't|does not|do not|didn't|did not|aren't|are not) (all )?pass)\b/i;

export async function verifyRun(c: Claim, ctx: Ctx): Promise<Result> {
  const cmd = c.fields.cmd;
  // A `run` line asserts the command passed, unless its text says it failed, or it has no text at all (a record
  // that the command ran). Both of those were read as pass claims in the benchmark and caused false blocks.
  const expect: 'pass' | 'fail' | 'ran' = c.textless ? 'ran' : FAILURE_RE.test(c.text) ? 'fail' : 'pass';
  if (expect !== 'pass') return verifyRunOutcome(c, ctx, expect);
  const target = targetOf(cmd);
  const entry = latestRun(ctx.entries, cmd);
  if (!entry) return mk(c, 'CONTRADICTED', `\`${cmd}\` never ran in this session`, 'checked against the session command ledger', [], { reason: 'never-ran' });
  const seg = matchingSegment(entry, target)!;
  const s = entry.summary ?? null;
  // show the command that matched, not the whole tool call (which may start with a heredoc or a cd)
  const shown = seg.text.replace(/\s+/g, ' ');
  const ran = `\`${shown.length > 50 ? shown.slice(0, 50) + '…' : shown}\``;
  const tail = entry.out_tail ? [entry.out_tail.split('\n').slice(-3).join(' ⏎ ')] : [];

  // (2) latest run failed
  if (entry.exit !== null && entry.exit_trusted && entry.exit !== 0) {
    return mk(c, 'CONTRADICTED', `${ran} exited ${entry.exit}${s && s.failed ? `, ${s.failed} failed` : ''}`, 'the most recent matching run failed', tail);
  }
  if (s && s.failed > 0) {
    return mk(c, 'CONTRADICTED', `${ran} reported ${s.failed} failed (${s.runner} summary)`, 'exit status was not trusted; the parsed summary shows failures', tail);
  }
  // (3) exit status masked and no summary
  if (!entry.exit_trusted && !s) {
    const why = seg.maskReason ? `exit status masked (${seg.maskReason})` : 'exit status unavailable';
    return unverified(c, 'masked', `${ran}: ${why}, no test summary parsed`, 'cannot tell whether it passed; re-run without piping, or use `receipts run -- <cmd>`');
  }
  if (!entry.exit_trusted && entry.exit !== null && entry.exit !== 0 && !s) {
    return unverified(c, 'masked', `${ran}: non-zero status but exit not trusted`, '');
  }
  // (4) nothing executed
  if (s && s.passed + s.failed === 0) {
    return mk(c, 'CONTRADICTED', `${ran}: no tests executed (${s.runner}: ${s.skipped} skipped)`, 'a green run with zero tests proves nothing', tail, { reason: 'unchecked' });
  }
  // (5) subset
  const isTest = isTestCmd(target) || (ctx.fullTest ? target === normaliseSegment(ctx.fullTest) : false);
  if (isTest && isWholeSuiteClaim(c.text)) {
    const f = detectFilter(target);
    if (f) return mk(c, 'CONTRADICTED', `only a subset ran: ${ran} has ${f}`, 'claim is about the whole suite', [], { reason: 'subset' });
    if (s?.filtered) return mk(c, 'CONTRADICTED', `only a subset ran: ${s.filtered} tests filtered out (${s.runner})`, 'claim is about the whole suite', [], { reason: 'subset' });
    if (ctx.fullTest) {
      const full = normaliseSegment(ctx.fullTest);
      if (target !== full && !target.startsWith(full + ' ') && runnerKey(target) !== runnerKey(full)) {
        // A different runner/script is not evidence the suite was partial, only that it is unproven: say so, don't accuse.
        return unverified(c, 'subset', `last run was ${ran}, not the configured full command \`${ctx.fullTest}\`: cannot tell it covers the whole suite`, 'claim is about the whole suite; run the configured command');
      }
    }
  }
  // (6) staleness
  let stalenessNote = '';
  if (entry.snap) {
    const now = await ctx.snapshot();
    if (now && now !== entry.snap) {
      const label = 'STALE';
      return mk(c, 'UNVERIFIED', `${label}: files changed after ${ran} ran`, 'edits since the run mean its result no longer applies; re-run it', [], { reason: 'stale', stale: true });
    }
    if (!now) stalenessNote = '; staleness not checked (no snapshot)';
  } else if (isTestCmd(target) || isBuildCmd(target)) stalenessNote = '; staleness not checked (no snapshot recorded)';
  const counts = s ? `${s.passed} ${s.unit === 'packages' ? 'packages ok' : 'passed'}${s.skipped ? `, ${s.skipped} skipped` : ''}` : `exit ${entry.exit}`;
  const skipNote = s && s.skipped ? `${s.skipped} skipped tests were not run. ` : '';
  return mk(c, 'VERIFIED', `${ran} ${entry.exit !== null && entry.exit_trusted ? `exit ${entry.exit}, ` : ''}${counts}`, `${skipNote}the command's result was read from the ledger; test quality was not checked${stalenessNote}`, tail);
}

/** For `run` lines that report a failure, or only record that a command ran. */
async function verifyRunOutcome(c: Claim, ctx: Ctx, expect: 'fail' | 'ran'): Promise<Result> {
  const cmd = c.fields.cmd;
  const entry = latestRun(ctx.entries, cmd);
  if (!entry) return mk(c, 'CONTRADICTED', `\`${cmd}\` never ran in this session`, 'checked against the session command ledger', [], { reason: 'never-ran' });
  const seg = matchingSegment(entry, targetOf(cmd))!;
  const shown = seg.text.replace(/\s+/g, ' ');
  const ran = `\`${shown.length > 50 ? shown.slice(0, 50) + '…' : shown}\``;
  const s = entry.summary ?? null;
  const failed = (entry.exit_trusted && entry.exit !== null && entry.exit !== 0) || (s ? s.failed > 0 : false);
  const passed = !failed && ((entry.exit_trusted && entry.exit === 0) || (s ? s.failed === 0 && s.passed > 0 : false));
  const outcome = failed ? `failed${entry.exit !== null && entry.exit_trusted ? ` (exit ${entry.exit})` : ''}${s?.failed ? `, ${s.failed} failed` : ''}` : passed ? 'passed' : 'outcome unknown (exit status masked or unavailable)';
  const note = 'the outcome was read from the ledger';
  if (expect === 'ran') return mk(c, 'VERIFIED', `${ran} ran; ${outcome}`, `${note}; this line records a run, it does not claim the run passed`);
  if (failed) return mk(c, 'VERIFIED', `${ran} ${outcome}, as stated`, note);
  if (passed) return mk(c, 'CONTRADICTED', `said ${ran} failed, but it passed`, note);
  return unverified(c, 'masked', `${ran}: ${outcome}`, note);
}
