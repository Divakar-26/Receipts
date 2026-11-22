import { Parser, num, lastMatch } from './util.js';
/** phpunit: `OK (42 tests, 100 assertions)`, `Tests: 42, Assertions: 100, Failures: 1, Skipped: 2.`, `No tests executed!` */
export const phpunit: Parser = (out) => {
  const ok = lastMatch(/^OK \((\d+) tests?, \d+ assertions?\)/m, out);
  if (ok) return { runner: 'phpunit', passed: num(ok[1]), failed: 0, skipped: 0 };
  const t = lastMatch(/^Tests: (\d+),.*$/m, out);
  if (t) {
    const g = (k: string) => num(new RegExp(`${k}: (\\d+)`).exec(t[0])?.[1]);
    const total = num(t[1]), failed = g('Failures') + g('Errors'), skipped = g('Skipped') + g('Incomplete');
    return { runner: 'phpunit', passed: Math.max(0, total - failed - skipped), failed, skipped };
  }
  if (/No tests executed!/.test(out)) return { runner: 'phpunit', passed: 0, failed: 0, skipped: 0 };
  return null;
};
