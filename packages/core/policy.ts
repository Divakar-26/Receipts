import { Config, Result } from './types.js';

export interface Decision {
  block: boolean;
  /** Why we would have blocked (also set when the retry cap prevented it). */
  wouldBlock: boolean;
  capped: boolean;
  reasons: string[];
}

export const FORMAT_REMINDER =
  'Format reminder: end your reply with a <receipts> block, one line per factual claim: `type | claim | key: value`. ' +
  'Types: code (path:line + quote:), run (cmd:), absent (pattern:), only (symbol: + in:), change (old: + new:), dep (name:), judge. ' +
  "If you did not check it, say so or drop the claim.";

export function reasonFor(r: Result): string | null {
  const t = r.claim.text;
  if (r.strong) return `Strong claim with no receipt: "${t}". ${r.summary}. Add a receipt line for it, or withdraw or narrow it.`;
  if (r.label === 'CONTRADICTED') return `You said "${t}". ${r.summary}. Fix it, or withdraw or narrow the claim.`;
  if (r.stale) return `"${t}": ${r.summary}. Re-run it, or say it was not re-run.`;
  return null;
}

export function decide(results: Result[], config: Config, o: { blocksSoFar: number; stopHookActive?: boolean }): Decision {
  const reasons: string[] = [];
  for (const r of results) {
    if (r.reason === 'timeout') continue; // a timeout never blocks
    if (config.mode === 'strict' && r.label === 'UNVERIFIED' && r.universal && !r.strong && !r.stale) {
      reasons.push(`Universal claim not verified: "${r.claim.text}". ${r.summary}. Prove it with a receipt, or narrow it.`);
      continue;
    }
    if (r.strong && config.untaggedClaims === 'report') continue; // reported, but only evidence blocks
    const why = reasonFor(r);
    if (why) reasons.push(why);
  }
  const wouldBlock = config.mode !== 'warn' && reasons.length > 0;
  const cap = Math.min(2, Math.max(0, config.maxRetries));
  const capped = wouldBlock && (!!o.stopHookActive || o.blocksSoFar >= cap);
  return { block: wouldBlock && !capped, wouldBlock, capped, reasons };
}

export function blockMessage(d: Decision): string {
  return d.reasons.map((r, i) => `${i + 1}. ${r}`).join('\n') + '\n\n' + FORMAT_REMINDER;
}
