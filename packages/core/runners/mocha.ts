import { Parser, num, lastMatch } from './util.js';
/** mocha: `  42 passing (1s)` / `  1 failing` / `  3 pending` */
export const mocha: Parser = (out) => {
  const p = lastMatch(/^\s*(\d+) passing\b/m, out);
  if (!p) return null;
  return {
    runner: 'mocha',
    passed: num(p[1]),
    failed: num(lastMatch(/^\s*(\d+) failing\b/m, out)?.[1]),
    skipped: num(lastMatch(/^\s*(\d+) pending\b/m, out)?.[1]),
  };
};
