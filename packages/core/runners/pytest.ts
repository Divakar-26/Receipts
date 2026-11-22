import { Parser, num, lastMatch } from './util.js';
/** pytest: `==== 3 failed, 39 passed, 1 skipped in 0.5s ====` or `no tests ran` */
export const pytest: Parser = (out) => {
  const m = lastMatch(/^=+\s*(?:(\d+ (?:failed|passed|skipped|error|errors|xfailed|xpassed|deselected|warnings?)(?:, )?)+)\s+in\s+[\d.]+s.*=+\s*$/m, out);
  if (m) {
    const line = m[0];
    const g = (k: string) => num(new RegExp(`(\\d+) ${k}`).exec(line)?.[1]);
    return {
      runner: 'pytest',
      passed: g('passed') + g('xpassed'),
      failed: g('failed') + g('errors?') + 0,
      skipped: g('skipped') + g('xfailed'),
      filtered: g('deselected') || undefined,
    };
  }
  if (/^=+\s*no tests ran\b/m.test(out) || /^collected 0 items/m.test(out)) {
    return { runner: 'pytest', passed: 0, failed: 0, skipped: 0 };
  }
  return null;
};
