import { Parser } from './util.js';
/**
 * go test. With -v we count `--- PASS/FAIL/SKIP` lines (unit: tests).
 * Without -v only package results exist (unit: packages).
 */
export const gotest: Parser = (out) => {
  const verbose = (re: RegExp) => (out.match(re) ?? []).length;
  const vp = verbose(/^\s*--- PASS:/gm);
  const vf = verbose(/^\s*--- FAIL:/gm);
  const vs = verbose(/^\s*--- SKIP:/gm);
  const okPk = (out.match(/^ok\s+\S+\s+(?:\(cached\)|[\d.]+s)(?!.*\[no tests to run\])/gm) ?? []).length;
  const failPk = verbose(/^FAIL\s+\S+/gm);
  const noTests = verbose(/^ok\s+\S+.*\[no tests to run\]/gm) + verbose(/^\?\s+\S+\s+\[no test files\]/gm);
  if (vp + vf + vs > 0) return { runner: 'go test', passed: vp, failed: Math.max(vf, failPk ? 1 : 0), skipped: vs, unit: 'tests' };
  if (okPk + failPk + noTests === 0) return null;
  return { runner: 'go test', passed: okPk, failed: failPk, skipped: 0, unit: 'packages' };
};
