import { TestSummary } from '../types.js';
export type Parser = (out: string) => TestSummary | null;
export const num = (s: string | undefined): number => (s ? parseInt(s, 10) : 0);
export function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '');
}
/** Last regex match in text. */
export function lastMatch(re: RegExp, text: string): RegExpExecArray | null {
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  let m: RegExpExecArray | null = null;
  let x: RegExpExecArray | null;
  while ((x = g.exec(text))) {
    m = x;
    if (x[0] === '') g.lastIndex++;
  }
  return m;
}
