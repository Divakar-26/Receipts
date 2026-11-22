import { Claim, Config, Label, LedgerEntry, Reason, Result } from '../types.js';

export interface Ctx {
  /** Realpath of the repo root. */
  root: string;
  config: Config;
  /** Ledger entries of this session. */
  entries: LedgerEntry[];
  deadline: number;
  snapshot: () => Promise<string | null>;
  /** Configured or detected full test command. */
  fullTest?: string;
}

export function mk(
  claim: Claim,
  label: Label,
  summary: string,
  note: string,
  evidence: string[] = [],
  extra: Partial<Result> = {},
): Result {
  return { claim, label, summary, note, evidence, ...extra };
}

export const unverified = (claim: Claim, reason: Reason, summary: string, note = '', evidence: string[] = []): Result =>
  mk(claim, 'UNVERIFIED', summary, note, evidence, { reason });

export function listHits(hits: { file: string; line: number }[], n = 5): string {
  const shown = hits.slice(0, n).map((h) => `${h.file}:${h.line}`);
  return shown.join(', ') + (hits.length > n ? `, +${hits.length - n} more` : '');
}
