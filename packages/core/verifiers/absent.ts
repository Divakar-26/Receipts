import { Claim, Result } from '../types.js';
import { search, Hit } from '../search.js';
import { Ctx, listHits, mk, unverified } from './ctx.js';

const NOTE_ABSENT = 'static text search of the whole repo; generated or dynamically built code not covered';

const scopeOf = (c: Claim): string[] =>
  (c.fields.in ?? '')
    .split(',')
    .map((p) => p.trim().replace(/:\d+(?:-\d+)?$/, '').replace(/^\.\//, '').replace(/\/+$/, ''))
    .filter(Boolean);
const inScope = (file: string, scope: string[]) => scope.some((s) => file === s || file.startsWith(s + '/'));
/**
 * Hits that exist only in gitignored files (a local config loaded at runtime, or stale build output). They do not
 * contradict the claim, but they stop it from being verified: the agent's own search usually skipped them too.
 */
async function ignoredOnlyHits(ctx: Ctx, pattern: string, o: { fixed?: boolean; word?: boolean }, seen: Hit[]): Promise<Hit[]> {
  const r = await search(ctx.root, { pattern, ...o, includeIgnored: true, ignore: ctx.config.ignore, deadline: ctx.deadline, maxHits: 50 });
  if (r.error || r.timedOut) return [];
  const key = (h: Hit) => `${h.file}:${h.line}`;
  const known = new Set(seen.map(key));
  return r.hits.filter((h) => !known.has(key(h)));
}
const ignoredNote = (hits: Hit[]) => `${hits.length} hit${hits.length === 1 ? '' : 's'} in gitignored files: ${listHits(hits)}`;

const hitLines = (hits: Hit[]) => hits.slice(0, 10).map((h) => `${h.file}:${h.line}: ${h.text.trim().slice(0, 100)}`);

/**
 * The search always covers the whole repo, so the report shows every hit. When the claim names its own scope
 * with `in:`, only hits inside that scope contradict it; hits elsewhere are reported in the note. (The benchmark
 * showed agents correctly scoping "no debug prints left in checkout" and being contradicted by a file they had
 * themselves reported.)
 */
export async function verifyAbsent(c: Claim, ctx: Ctx): Promise<Result> {
  const pattern = c.fields.pattern;
  if (pattern.length > 500 || /[\0\n\r]/.test(pattern)) return unverified(c, 'invalid', 'pattern rejected (too long or has control characters)');
  const r = await search(ctx.root, { pattern, ignore: ctx.config.ignore, deadline: ctx.deadline });
  const shown = `/${pattern}/`;
  if (r.timedOut) return unverified(c, 'timeout', `${shown}: search timed out`, NOTE_ABSENT);
  if (r.error) return unverified(c, 'invalid', `${shown}: ${r.error}`, NOTE_ABSENT);
  if (!r.hits.length) {
    const hidden = await ignoredOnlyHits(ctx, pattern, {}, []);
    const scoped = scopeOf(c);
    const relevant = scoped.length ? hidden.filter((h) => inScope(h.file, scoped)) : hidden;
    if (relevant.length) return unverified(c, 'unchecked', `${shown} → 0 hits in tracked files, but ${ignoredNote(relevant)}`, 'gitignored files can be local config loaded at runtime, or build output; check them', hitLines(relevant));
    return mk(c, 'VERIFIED', `${shown} → 0 hits`, NOTE_ABSENT);
  }
  const scope = scopeOf(c);
  const plural = (n: number) => (n === 1 ? '' : 's');
  if (scope.length) {
    const inside = r.hits.filter((h) => inScope(h.file, scope));
    const outside = r.hits.filter((h) => !inScope(h.file, scope));
    if (!inside.length) {
      return mk(c, 'VERIFIED', `${shown} → 0 hits in ${scope.join(', ')}`, `searched the whole repo; ${outside.length}${r.truncated ? '+' : ''} hit${plural(outside.length)} outside that scope: ${listHits(outside)}`, hitLines(outside));
    }
    return mk(c, 'CONTRADICTED', `${shown} → ${inside.length} hit${plural(inside.length)} in ${scope.join(', ')}: ${listHits(inside)}`, NOTE_ABSENT, hitLines(inside));
  }
  const n = r.hits.length + (r.truncated ? '+' : '');
  return mk(c, 'CONTRADICTED', `${shown} → ${n} hit${plural(r.hits.length)}: ${listHits(r.hits)}`, NOTE_ABSENT, hitLines(r.hits));
}

const isName = (s: string) => /^[\w$.]+$/.test(s);
/** Snippet lines: agents write `\n` literally inside a receipt line. */
const snippetLines = (s: string) => s.split(/\\n|\n/).map((l) => l.trim()).filter(Boolean);

export async function verifyChange(c: Claim, ctx: Ctx): Promise<Result> {
  const { old: oldName, new: newName } = c.fields;
  const bad = (s: string) => s.length > 300 || /[\0\r]/.test(s);
  if (bad(oldName) || bad(newName)) return unverified(c, 'invalid', 'value rejected (too long or has control characters)');
  if (isName(oldName) && isName(newName)) return verifyRename(c, ctx, oldName, newName);
  return verifySnippetChange(c, ctx, oldName, newName);
}

/** A rename: the old name is gone everywhere and the new one exists. */
async function verifyRename(c: Claim, ctx: Ctx, oldName: string, newName: string): Promise<Result> {
  const word = (s: string) => /^[\w$]+$/.test(s);
  const [o, n] = await Promise.all([
    search(ctx.root, { pattern: oldName, fixed: true, word: word(oldName), ignore: ctx.config.ignore, deadline: ctx.deadline }),
    search(ctx.root, { pattern: newName, fixed: true, word: word(newName), ignore: ctx.config.ignore, deadline: ctx.deadline, maxHits: 5 }),
  ]);
  const note = `static text search; '${oldName}' absent and '${newName}' present, not that every use was renamed correctly`;
  if (o.timedOut || n.timedOut) return unverified(c, 'timeout', `${oldName} → ${newName}: search timed out`, note);
  if (o.error || n.error) return unverified(c, 'invalid', `${oldName} → ${newName}: ${o.error ?? n.error}`, note);
  if (o.hits.length) return mk(c, 'CONTRADICTED', `old name \`${oldName}\` still appears ${o.hits.length}${o.truncated ? '+' : ''}×: ${listHits(o.hits)}`, note, hitLines(o.hits));
  if (!n.hits.length) return mk(c, 'CONTRADICTED', `new name \`${newName}\` not found anywhere`, note);
  const hidden = await ignoredOnlyHits(ctx, oldName, { fixed: true, word: word(oldName) }, []);
  if (hidden.length) return unverified(c, 'unchecked', `\`${oldName}\` → 0 hits in tracked files, but ${ignoredNote(hidden)}`, 'gitignored files can be local config loaded at runtime, or build output; check them', hitLines(hidden));
  return mk(c, 'VERIFIED', `\`${oldName}\` → 0 hits; \`${newName}\` → ${n.hits.length}${n.truncated ? '+' : ''} hits`, note);
}

/**
 * A code edit (`old: x = 1 | new: x = 2`, `old: pytest | new: pytest\npackaging`): the new lines exist, and the old
 * lines are gone unless the new text still contains them. Only a clear "old still there, new missing" contradicts.
 */
async function verifySnippetChange(c: Claim, ctx: Ctx, oldText: string, newText: string): Promise<Result> {
  const newLines = snippetLines(newText);
  const oldLines = snippetLines(oldText).filter((l) => !newLines.some((n) => n.includes(l)));
  const find = (l: string) => search(ctx.root, { pattern: l, fixed: true, ignore: ctx.config.ignore, deadline: ctx.deadline, maxHits: 5 });
  const [newRes, oldRes] = await Promise.all([Promise.all(newLines.map(find)), Promise.all(oldLines.map(find))]);
  const all = [...newRes, ...oldRes];
  const note = 'text search for each line of the snippet; where and why it changed was not checked';
  if (all.some((r) => r.timedOut)) return unverified(c, 'timeout', 'change: search timed out', note);
  if (all.some((r) => r.error)) return unverified(c, 'invalid', `change: ${all.find((r) => r.error)!.error}`, note);
  const newMissing = newLines.filter((_, i) => !newRes[i].hits.length);
  const oldPresent = oldLines.filter((_, i) => oldRes[i].hits.length);
  if (!newMissing.length && !oldPresent.length) return mk(c, 'VERIFIED', `new text present${oldLines.length ? ', old text gone' : ''}`, note);
  if (newMissing.length && oldPresent.length === oldLines.length && oldLines.length) {
    return mk(c, 'CONTRADICTED', `old text still present and new text not found: \`${oldPresent[0].slice(0, 60)}\``, note);
  }
  const what = [newMissing.length ? `new line not found verbatim: \`${newMissing[0].slice(0, 60)}\`` : '', oldPresent.length ? `old line still present: \`${oldPresent[0].slice(0, 60)}\`` : ''].filter(Boolean).join('; ');
  return unverified(c, 'unchecked', `could not confirm the edit (${what})`, note);
}
