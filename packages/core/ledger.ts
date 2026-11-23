import * as fs from 'node:fs';
import * as path from 'node:path';
import { LedgerEntry, LedgerShell } from './types.js';

const SECRET_PATTERNS: [RegExp, string][] = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g, '[REDACTED:private-key]'],
  [/\bAKIA[0-9A-Z]{16}\b/g, '[REDACTED:aws-key]'],
  [/\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{20,}\b/g, '[REDACTED:github-token]'],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g, '[REDACTED:slack-token]'],
  [/\bsk-[A-Za-z0-9_-]{20,}\b/g, '[REDACTED:api-key]'],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '[REDACTED:jwt]'],
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+\/=-]{12,}/gi, '$1 [REDACTED]'],
  [
    /\b([A-Za-z0-9_]*(?:password|passwd|secret|token|api[_-]?key|access[_-]?key|auth)[A-Za-z0-9_]*)(\s*[=:]\s*)(?:"[^"\n]*"|'[^'\n]*'|[^\s"',;]+)/gi,
    '$1$2[REDACTED]',
  ],
  [/(:\/\/[^\s:@\/]+:)[^\s@\/]+@/g, '$1[REDACTED]@'],
];

export function redact(s: string): string {
  let out = s;
  for (const [re, rep] of SECRET_PATTERNS) out = out.replace(re, rep);
  return out;
}

/** Last `n` lines, secrets redacted, each line capped in length. */
export function tailLines(output: string, n = 40): string {
  const lines = output.replace(/\r\n/g, '\n').split('\n');
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  return redact(
    lines
      .slice(-n)
      .map((l) => (l.length > 400 ? l.slice(0, 400) + '…' : l))
      .join('\n'),
  );
}

export const LEDGER_DIR = '.receipts';
export const ledgerPath = (cwd: string) => path.join(cwd, LEDGER_DIR, 'ledger.jsonl');

export function appendEntry(file: string, entry: LedgerEntry): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify(entry) + '\n');
}

export function parseLedger(text: string): LedgerEntry[] {
  const out: LedgerEntry[] = [];
  const snaps = new Map<string, string | null>();
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line);
      if (e && (e.kind === 'shell' || e.kind === 'web') && typeof e.session === 'string') out.push(e as LedgerEntry);
      else if (e && e.kind === 'snap' && typeof e.id === 'string') snaps.set(e.id, typeof e.snap === 'string' ? e.snap : null);
    } catch {
      /* skip corrupt line */
    }
  }
  // deferred snapshots (written by the snapshot worker after the ledger hook returned)
  for (const e of out) {
    if (e.kind === 'shell' && e.snap_id && snaps.has(e.snap_id)) {
      e.snap = snaps.get(e.snap_id) ?? null;
      delete e.snap_id;
    }
  }
  return out;
}

/** Record a snapshot taken later for the entry with this `snap_id`. */
export function appendSnapshot(file: string, id: string, snap: string | null): void {
  fs.appendFileSync(file, JSON.stringify({ kind: 'snap', id, snap }) + '\n');
}

export function readLedger(file: string): LedgerEntry[] {
  try {
    return parseLedger(fs.readFileSync(file, 'utf8'));
  } catch {
    return [];
  }
}

/** Entries of one session. Without an id, the session of the most recent entry. */
export function sessionEntries(all: LedgerEntry[], session?: string): LedgerEntry[] {
  const id = session ?? all[all.length - 1]?.session;
  return id === undefined ? [] : all.filter((e) => e.session === id);
}

/** Keep only the entries of the last `keep` distinct sessions (by order of last appearance). */
export function pruneLedger(file: string, keep = 20): number {
  const entries = readLedger(file);
  const order: string[] = [];
  for (const e of entries) {
    const i = order.indexOf(e.session);
    if (i >= 0) order.splice(i, 1);
    order.push(e.session);
  }
  if (order.length <= keep) return 0;
  const keepSet = new Set(order.slice(-keep));
  const kept = entries.filter((e) => keepSet.has(e.session));
  fs.writeFileSync(file, kept.map((e) => JSON.stringify(e)).join('\n') + (kept.length ? '\n' : ''));
  return entries.length - kept.length;
}

export type ShellEntryInput = Omit<LedgerShell, 'kind' | 'ts'> & { ts?: string };
