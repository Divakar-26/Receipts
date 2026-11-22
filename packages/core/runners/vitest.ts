import { Parser, num, lastMatch } from './util.js';
/** vitest: ` Tests  1 failed | 41 passed | 1 skipped (43)` */
export const vitest: Parser = (out) => {
  const m = lastMatch(/^\s*Tests\s+(.*\(\d+\))\s*$/m, out);
  if (m) {
    const g = (k: string) => num(new RegExp(`(\\d+) ${k}`).exec(m[1])?.[1]);
    return { runner: 'vitest', passed: g('passed'), failed: g('failed'), skipped: g('skipped') + g('todo') };
  }
  if (/No test files found/.test(out)) return { runner: 'vitest', passed: 0, failed: 0, skipped: 0 };
  return null;
};
