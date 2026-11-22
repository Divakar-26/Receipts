import { Label, Result } from './types.js';
import { Warning } from './scanner.js';

export interface Report {
  results: Result[];
  warnings: Warning[];
  elapsedMs: number;
  /** Set when the retry cap stopped us from blocking. */
  capped?: boolean;
  noBlock?: boolean;
}

const ICON: Record<Label, string> = { VERIFIED: '✅', CITED: '📎', CONTRADICTED: '❌', UNVERIFIED: '⚠️' };
const COLOR: Record<Label, string> = { VERIFIED: '32', CITED: '36', CONTRADICTED: '31', UNVERIFIED: '33' };

export function counts(results: Result[]) {
  const n = (l: Label) => results.filter((r) => r.label === l).length;
  return { total: results.length, verified: n('VERIFIED'), cited: n('CITED'), contradicted: n('CONTRADICTED'), unverified: n('UNVERIFIED') };
}

export function formatReport(rep: Report, color = false): string {
  const paint = (code: string, s: string) => (color ? `\u001b[${code}m${s}\u001b[0m` : s);
  if (!rep.results.length && !rep.warnings.length) return '🧾 no claims';
  const c = counts(rep.results);
  const parts = [`${c.total} claim${c.total === 1 ? '' : 's'}`];
  if (c.verified) parts.push(`${c.verified} verified`);
  if (c.cited) parts.push(`${c.cited} cited`);
  if (c.contradicted) parts.push(`${c.contradicted} contradicted`);
  if (c.unverified) parts.push(`${c.unverified} unverified`);
  const lines = [paint('1', `🧾 Receipts — ${parts.join(' · ')}`) + `   (${(rep.elapsedMs / 1000).toFixed(1)}s)`, ''];
  const WIDTH = 44;
  for (const r of rep.results) {
    let text = r.claim.text.replace(/\s+/g, ' ');
    if (text.length > WIDTH) text = text.slice(0, WIDTH - 1) + '…';
    if (r.label === 'CONTRADICTED' || r.strong) text = `"${text}"`;
    const dots = ' ' + '.'.repeat(Math.max(3, WIDTH + 2 - text.length)) + ' ';
    const tag = r.checkedAs && r.claim.originalType ? ` [checked as ${r.checkedAs}]` : '';
    lines.push(`${ICON[r.label]} ${text}${paint('2', dots)}${paint(COLOR[r.label], r.summary)}${tag}`);
  }
  if (rep.warnings.length) {
    lines.push('');
    for (const w of rep.warnings.slice(0, 5)) lines.push(paint('2', `· note (${w.category}, not checked): ${w.sentence.slice(0, 90)}`));
  }
  const notes = rep.results.filter((r) => r.note && (r.label === 'VERIFIED' || r.label === 'CITED'));
  if (notes.length) {
    lines.push('');
    for (const r of notes.slice(0, 6)) lines.push(paint('2', `  ↳ ${r.claim.text.slice(0, 30)}: ${r.note}`));
  }
  if (rep.capped) lines.push('', paint('33', 'Receipts already sent the agent back once this turn; not blocking again.'));
  return lines.join('\n');
}
