import { Claim, LedgerEntry, Result } from '../types.js';
import { identifiers } from '../lexicon.js';
import { isBuildCmd, isTestCmd, analyseCommand } from '../cmd.js';
import { search } from '../search.js';
import { Ctx, mk } from './ctx.js';

/** A judgment can't be proven. We list the evidence that does exist. */
export async function verifyJudge(c: Claim, ctx: Ctx): Promise<Result> {
  const ev: string[] = [];
  const web = ctx.entries.filter((e): e is Extract<LedgerEntry, { kind: 'web' }> => e.kind === 'web');
  const src = c.fields.source;
  if (src) {
    const fetched = web.some((w) => w.url === src || w.url.startsWith(src) || src.startsWith(w.url));
    ev.push(fetched ? `source fetched this session: ${src}` : `source NOT fetched this session: ${src}`);
  }
  const shells = ctx.entries.filter((e): e is Extract<LedgerEntry, { kind: 'shell' }> => e.kind === 'shell');
  const tests = shells.filter((e) => analyseCommand(e.cmd).some((s) => isTestCmd(s.norm)));
  const builds = shells.filter((e) => analyseCommand(e.cmd).some((s) => isBuildCmd(s.norm)));
  if (tests.length) {
    const last = tests[tests.length - 1];
    ev.push(`last test run: \`${last.cmd}\` ${last.exit === null ? '(exit unknown)' : 'exit ' + last.exit}`);
  } else ev.push('no test command ran this session');
  if (builds.length) ev.push(`last build: \`${builds[builds.length - 1].cmd}\``);

  const syms = identifiers(c.text).filter((i) => /^[A-Za-z_$][\w$]{2,}$/.test(i)).slice(0, 3);
  for (const sym of syms) {
    const r = await search(ctx.root, { pattern: sym, fixed: true, word: true, ignore: ctx.config.ignore, deadline: ctx.deadline, maxHits: 100 });
    const files = [...new Set(r.hits.map((h) => h.file))];
    if (files.length) {
      ev.push(`${files.length} file(s) reference \`${sym}\`: ${files.slice(0, 4).join(', ')}${files.length > 4 ? ', …' : ''}`);
    }
  }
  const short = ev.slice(0, 2).join('; ');
  return mk(c, 'UNVERIFIED', short || 'judgment: no tool can prove this', 'a judgment cannot be proven by search or by a command; the evidence above is what exists', ev, { reason: 'unprovable' });
}
