import { Claim, Result } from '../types.js';
import { search } from '../search.js';
import { Ctx, listHits, mk, unverified } from './ctx.js';

const NOTE_ABSENT = 'static text search of the whole repo; generated or dynamically built code not covered';

export async function verifyAbsent(c: Claim, ctx: Ctx): Promise<Result> {
  const pattern = c.fields.pattern;
  if (pattern.length > 500 || /[\0\n\r]/.test(pattern)) return unverified(c, 'invalid', 'pattern rejected (too long or has control characters)');
  const r = await search(ctx.root, { pattern, ignore: ctx.config.ignore, deadline: ctx.deadline });
  const shown = `/${pattern}/`;
  if (r.timedOut) return unverified(c, 'timeout', `${shown}: search timed out`, NOTE_ABSENT);
  if (r.error) return unverified(c, 'invalid', `${shown}: ${r.error}`, NOTE_ABSENT);
  if (!r.hits.length) return mk(c, 'VERIFIED', `${shown} → 0 hits`, NOTE_ABSENT);
  const n = r.hits.length + (r.truncated ? '+' : '');
  return mk(c, 'CONTRADICTED', `${shown} → ${n} hit${r.hits.length === 1 ? '' : 's'}: ${listHits(r.hits)}`, NOTE_ABSENT, r.hits.slice(0, 10).map((h) => `${h.file}:${h.line}: ${h.text.trim().slice(0, 100)}`));
}

export async function verifyChange(c: Claim, ctx: Ctx): Promise<Result> {
  const { old: oldName, new: newName } = c.fields;
  const bad = (s: string) => s.length > 200 || /[\0\n\r]/.test(s);
  if (bad(oldName) || bad(newName)) return unverified(c, 'invalid', 'name rejected (too long or has control characters)');
  const word = (s: string) => /^[\w$]+$/.test(s);
  const [o, n] = await Promise.all([
    search(ctx.root, { pattern: oldName, fixed: true, word: word(oldName), ignore: ctx.config.ignore, deadline: ctx.deadline }),
    search(ctx.root, { pattern: newName, fixed: true, word: word(newName), ignore: ctx.config.ignore, deadline: ctx.deadline, maxHits: 5 }),
  ]);
  const note = `static text search; '${oldName}' absent and '${newName}' present, not that every use was renamed correctly`;
  if (o.timedOut || n.timedOut) return unverified(c, 'timeout', `${oldName} → ${newName}: search timed out`, note);
  if (o.error || n.error) return unverified(c, 'invalid', `${oldName} → ${newName}: ${o.error ?? n.error}`, note);
  if (o.hits.length) {
    return mk(c, 'CONTRADICTED', `old name \`${oldName}\` still appears ${o.hits.length}${o.truncated ? '+' : ''}×: ${listHits(o.hits)}`, note, o.hits.slice(0, 10).map((h) => `${h.file}:${h.line}: ${h.text.trim().slice(0, 100)}`));
  }
  if (!n.hits.length) return mk(c, 'CONTRADICTED', `new name \`${newName}\` not found anywhere`, note);
  return mk(c, 'VERIFIED', `\`${oldName}\` → 0 hits; \`${newName}\` → ${n.hits.length}${n.truncated ? '+' : ''} hits`, note);
}
