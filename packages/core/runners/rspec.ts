import { Parser, num, lastMatch } from './util.js';
/** rspec: `42 examples, 0 failures, 1 pending` */
export const rspec: Parser = (out) => {
  const m = lastMatch(/^(\d+) examples?, (\d+) failures?(?:, (\d+) pending)?/m, out);
  if (!m) return null;
  const total = num(m[1]), failed = num(m[2]), skipped = num(m[3]);
  return { runner: 'rspec', passed: Math.max(0, total - failed - skipped), failed, skipped };
};
