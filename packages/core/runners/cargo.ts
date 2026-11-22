import { Parser, num } from './util.js';
/** cargo test: one `test result:` line per test binary; sum them. */
export const cargo: Parser = (out) => {
  const re = /^test result: (?:ok|FAILED)\. (\d+) passed; (\d+) failed; (\d+) ignored; \d+ measured; (\d+) filtered out/gm;
  let m: RegExpExecArray | null;
  let any = false;
  let p = 0, f = 0, s = 0, fo = 0;
  while ((m = re.exec(out))) {
    any = true;
    p += num(m[1]);
    f += num(m[2]);
    s += num(m[3]);
    fo += num(m[4]);
  }
  if (!any) return null;
  return { runner: 'cargo test', passed: p, failed: f, skipped: s, filtered: fo || undefined };
};
