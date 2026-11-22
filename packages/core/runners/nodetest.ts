import { Parser, num, lastMatch } from './util.js';
/** node:test summary: `ℹ tests 5`, `ℹ pass 4`, `ℹ fail 1`, `ℹ skipped 0` */
export const nodetest: Parser = (out) => {
  const t = lastMatch(/^\s*[ℹ#]\s*tests\s+(\d+)\s*$/m, out);
  const p = lastMatch(/^\s*[ℹ#]\s*pass\s+(\d+)\s*$/m, out);
  if (!t || !p) return null;
  return {
    runner: 'node:test',
    passed: num(p[1]),
    failed: num(lastMatch(/^\s*[ℹ#]\s*fail\s+(\d+)\s*$/m, out)?.[1]),
    skipped: num(lastMatch(/^\s*[ℹ#]\s*skipped\s+(\d+)\s*$/m, out)?.[1]) + num(lastMatch(/^\s*[ℹ#]\s*todo\s+(\d+)\s*$/m, out)?.[1]),
  };
};
