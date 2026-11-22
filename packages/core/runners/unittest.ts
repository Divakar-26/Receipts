import { Parser, num, lastMatch } from './util.js';
/** python unittest: `Ran 42 tests in 0.5s` then `OK (skipped=2)` or `FAILED (failures=1, errors=2)` */
export const unittest: Parser = (out) => {
  const r = lastMatch(/^Ran (\d+) tests? in [\d.]+s/m, out);
  if (!r) return null;
  const total = num(r[1]);
  const failedLine = lastMatch(/^FAILED \(([^)]*)\)/m, out);
  const okLine = lastMatch(/^OK(?: \(([^)]*)\))?/m, out);
  const g = (s: string | undefined, k: string) => num(new RegExp(`${k}=(\\d+)`).exec(s ?? '')?.[1]);
  const detail = failedLine?.[1] ?? okLine?.[1];
  const failed = g(detail, 'failures') + g(detail, 'errors');
  const skipped = g(detail, 'skipped');
  if (!failedLine && !okLine) return null;
  return { runner: 'unittest', passed: Math.max(0, total - failed - skipped), failed, skipped };
};
