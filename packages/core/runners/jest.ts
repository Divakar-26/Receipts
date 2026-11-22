import { Parser, num, lastMatch } from './util.js';
/** jest: `Tests:       1 failed, 41 passed, 1 skipped, 43 total` */
export const jest: Parser = (out) => {
  const m = lastMatch(/^Tests:\s+(.*\btotal)\s*$/m, out);
  if (m) {
    const g = (k: string) => num(new RegExp(`(\\d+) ${k}`).exec(m[1])?.[1]);
    return { runner: 'jest', passed: g('passed'), failed: g('failed'), skipped: g('skipped') + g('todo') };
  }
  if (/No tests found/.test(out)) return { runner: 'jest', passed: 0, failed: 0, skipped: 0 };
  return null;
};
