import { Parser, num, lastMatch } from './util.js';
/** maven surefire aggregate line (no "Time elapsed") and gradle's `N tests completed, M failed`. */
export const surefire: Parser = (out) => {
  const m = lastMatch(/^(?:\[(?:INFO|ERROR|WARNING)\]\s*)?Tests run: (\d+), Failures: (\d+), Errors: (\d+), Skipped: (\d+)\s*$/m, out);
  if (m) {
    const total = num(m[1]), failed = num(m[2]) + num(m[3]), skipped = num(m[4]);
    return { runner: 'surefire', passed: Math.max(0, total - failed - skipped), failed, skipped };
  }
  const g = lastMatch(/^(\d+) tests? completed(?:, (\d+) failed)?(?:, (\d+) skipped)?/m, out);
  if (g) {
    const total = num(g[1]), failed = num(g[2]), skipped = num(g[3]);
    return { runner: 'gradle', passed: Math.max(0, total - failed - skipped), failed, skipped };
  }
  return null;
};
