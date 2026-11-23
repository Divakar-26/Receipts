import { Parser, num, lastMatch } from './util.js';

/**
 * A test file that defines no tests is still reported as one passing test, at top level, named after the file:
 * `✔ test/noop.test.js (21ms)` (spec reporter) or `ok 1 - test/noop.test.js` (TAP). Files that do define tests list
 * the tests themselves instead. Counting those file-level passes lets "no tests executed" be detected.
 */
const FILE_LEVEL_PASS = /^(?:✔|ok \d+ -)\s+\S+\.[cm]?[jt]sx?(?:\s+\([\d.]+m?s\))?\s*$/gm;

/** node:test summary: `ℹ tests 5`, `ℹ pass 4`, `ℹ fail 1`, `ℹ skipped 0` (or `# …` with the TAP reporter). */
export const nodetest: Parser = (out) => {
  const t = lastMatch(/^\s*[ℹ#]\s*tests\s+(\d+)\s*$/m, out);
  const p = lastMatch(/^\s*[ℹ#]\s*pass\s+(\d+)\s*$/m, out);
  if (!t || !p) return null;
  const emptyFiles = (out.match(FILE_LEVEL_PASS) ?? []).length;
  return {
    runner: 'node:test',
    passed: Math.max(0, num(p[1]) - emptyFiles),
    failed: num(lastMatch(/^\s*[ℹ#]\s*fail\s+(\d+)\s*$/m, out)?.[1]),
    skipped: num(lastMatch(/^\s*[ℹ#]\s*skipped\s+(\d+)\s*$/m, out)?.[1]) + num(lastMatch(/^\s*[ℹ#]\s*todo\s+(\d+)\s*$/m, out)?.[1]),
  };
};
