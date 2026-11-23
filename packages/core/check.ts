import * as fs from 'node:fs';
import { parseMessage } from './claims.js';
import { loadConfig, detectCommands } from './config.js';
import { Claim, Config, LedgerEntry, Result } from './types.js';
import { analyseCommand, isTestCmd, normaliseSegment } from './cmd.js';
import { buildMatchers, hasUniversal } from './lexicon.js';
import { scanProse, typeGaming, Warning } from './scanner.js';
import { sessionEntries } from './ledger.js';
import { takeSnapshot } from './snapshot.js';
import { Ctx, mk, unverified } from './verifiers/ctx.js';
import { verifyCode } from './verifiers/code.js';
import { verifyRun } from './verifiers/run.js';
import { verifyAbsent, verifyChange } from './verifiers/absent.js';
import { verifyOnly } from './verifiers/only.js';
import { verifyDep } from './verifiers/dep.js';
import { verifyJudge } from './verifiers/judge.js';
import { decide, blockMessage, Decision } from './policy.js';
import { Report, formatReport } from './report.js';

export interface CheckInput {
  message: string;
  ledger: LedgerEntry[];
  cwd: string;
  config?: Config;
  session?: string;
  blocksSoFar?: number;
  stopHookActive?: boolean;
  /** Hard timeout in ms (default 10 000). */
  timeoutMs?: number;
}
export interface CheckOutput {
  results: Result[];
  warnings: Warning[];
  decision: Decision;
  report: Report;
  text: string;
  blockMessage: string;
  elapsedMs: number;
}

async function verifyOne(c: Claim, ctx: Ctx): Promise<Result> {
  if (Date.now() >= ctx.deadline) return unverified(c, 'timeout', 'not checked: timeout', 'the 10 s check budget ran out');
  switch (c.type) {
    case 'code': return verifyCode(c, ctx);
    case 'run': return verifyRun(c, ctx);
    case 'absent': return verifyAbsent(c, ctx);
    case 'only': return verifyOnly(c, ctx);
    case 'change': return verifyChange(c, ctx);
    case 'dep': return verifyDep(c, ctx);
    case 'judge': return verifyJudge(c, ctx);
    default: return unverified(c, 'invalid', 'unparseable claim');
  }
}

export async function check(input: CheckInput): Promise<CheckOutput> {
  const start = Date.now();
  const root = (() => { try { return fs.realpathSync(input.cwd); } catch { return input.cwd; } })();
  const config = input.config ?? loadConfig(root);
  const fullTest = config.testCommand ?? detectCommands(root).test;
  const m = buildMatchers(config.lexicon.extraUniversal, config.lexicon.extraJudge);
  const parsed = parseMessage(input.message);

  let snapP: Promise<string | null> | null = null;
  const ctx: Ctx = {
    root,
    config,
    entries: sessionEntries(input.ledger, input.session),
    deadline: start + (input.timeoutMs ?? 10_000),
    snapshot: () => (snapP ??= takeSnapshot(root)),
    fullTest,
  };

  // 1. type gaming on tagged claims
  const toVerify: Claim[] = [];
  const results: Result[] = [];
  const strongText: Result[] = [];
  const tagged: Claim[] = [];
  for (const c of parsed.claims) {
    const g = typeGaming(c, m, fullTest);
    if (g?.kind === 'strong') {
      strongText.push(mk(c, 'UNVERIFIED', g.why, 'a stronger check could not be built from this line', [], { reason: 'untagged', strong: true }));
      tagged.push(c);
    } else if (g?.kind === 'retype') {
      toVerify.push(g.claim);
      tagged.push(g.claim);
    } else {
      toVerify.push(c);
      tagged.push(c);
    }
  }

  // 2. verify tagged claims (concurrent; each checks the shared deadline)
  const verified = await Promise.all(
    toVerify.map(async (c) => {
      let r: Result;
      try {
        r = await verifyOne(c, ctx);
      } catch (e) {
        r = unverified(c, 'unchecked', `verifier error: ${(e as Error).message}`);
      }
      if (c.originalType) r.checkedAs = c.type === 'untagged' ? undefined : c.type;
      if (hasUniversal(m, c.text)) r.universal = true;
      return r;
    }),
  );
  results.push(...verified, ...strongText);

  // 3. scan prose and unparsed lines
  const unparsedText = parsed.untagged.map((u) => u.text).join('\n');
  const scan = scanProse(parsed.outside + '\n' + unparsedText, tagged, m);
  for (const f of scan.flagged) {
    const c: Claim = { type: 'untagged', text: f.sentence, fields: {}, line: 0 };
    if (f.kind === 'testpass') {
      // "all tests pass" in prose: the checker can verify this itself from the ledger instead of demanding a receipt.
      const fullNorm = fullTest ? normaliseSegment(fullTest) : null;
      const ran = [...ctx.entries].reverse().find((e) => e.kind === 'shell' && analyseCommand(e.cmd).some((s) => isTestCmd(s.norm) || s.norm === fullNorm));
      if (ran && ran.kind === 'shell') {
        const seg = analyseCommand(ran.cmd).find((s) => isTestCmd(s.norm) || s.norm === fullNorm)!;
        const auto: Claim = { type: 'run', text: f.sentence, fields: { cmd: seg.text }, line: 0, originalType: 'untagged' };
        const r = await verifyOne(auto, ctx);
        r.checkedAs = 'run';
        r.note = `no receipt was given; checked from the command ledger. ${r.note}`;
        results.push(r);
        continue;
      }
    }
    results.push(
      mk(c, 'UNVERIFIED', f.kind === 'testpass' ? 'says tests/build pass, but no `run` receipt' : 'universal claim about code with no receipt', 'the checker found this claim in free text', [], { reason: 'untagged', strong: true, universal: f.kind === 'universal' }),
    );
  }
  // Unparseable lines that the scanner didn't flag are still shown, as unverified claims.
  for (const u of parsed.untagged) {
    if (!scan.flagged.some((f) => f.sentence.includes(u.text) || u.text.includes(f.sentence))) {
      results.push(unverified(u, 'invalid', 'unparseable receipt line; nothing was checked', 'fix the line format so it can be verified'));
    }
  }

  const decision = decide(results, config, { blocksSoFar: input.blocksSoFar ?? 0, stopHookActive: input.stopHookActive });
  const elapsedMs = Date.now() - start;
  const report: Report = { results, warnings: scan.warnings, elapsedMs, capped: decision.capped };
  return { results, warnings: scan.warnings, decision, report, text: formatReport(report, false), blockMessage: blockMessage(decision), elapsedMs };
}
