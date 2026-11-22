import * as fs from 'node:fs';
import * as path from 'node:path';
import { Claim, Result } from '../types.js';
import { parseLoc } from '../claims.js';
import { Ctx, mk, unverified } from './ctx.js';

const MAX_BYTES = 5 * 1024 * 1024;
const ws = (s: string) => s.replace(/\s+/g, ' ').trim();
const NOTE = 'quote and location only; what the line means was not checked';

/** Resolve `file` inside `root`; refuses `..` escapes and symlinks that leave the root. */
export function resolveInside(root: string, file: string): { abs: string } | { error: string } {
  const lexical = path.resolve(root, file);
  const rel0 = path.relative(root, lexical);
  if (rel0.startsWith('..') || path.isAbsolute(rel0)) return { error: 'outside repo root (refused)' };
  let real: string;
  try {
    real = fs.realpathSync(lexical);
  } catch {
    return { error: 'file not found' };
  }
  const rel = path.relative(root, real);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return { error: 'outside repo root via symlink (refused)' };
  return { abs: real };
}

export function verifyCode(c: Claim, ctx: Ctx): Result {
  const loc = c.loc ? parseLoc(c.loc) : null;
  const quote = c.fields.quote;
  if (!loc || !quote) return unverified(c, 'invalid', 'malformed code citation');
  const r = resolveInside(ctx.root, loc.file);
  if ('error' in r) return mk(c, 'CONTRADICTED', `${loc.file}: ${r.error}`, NOTE);
  let st: fs.Stats;
  try {
    st = fs.statSync(r.abs);
  } catch {
    return mk(c, 'CONTRADICTED', `${loc.file}: file not found`, NOTE);
  }
  if (!st.isFile()) return mk(c, 'CONTRADICTED', `${loc.file}: not a file`, NOTE);
  if (st.size > MAX_BYTES) return unverified(c, 'unchecked', `${loc.file}: file too large to check (${st.size} bytes)`, NOTE);
  const buf = fs.readFileSync(r.abs);
  if (buf.subarray(0, 8000).includes(0)) return unverified(c, 'unchecked', `${loc.file}: binary file, not checked`, NOTE);
  const lines = buf.toString('utf8').split(/\r?\n/);
  if (loc.start < 1 || loc.start > lines.length) {
    return mk(c, 'CONTRADICTED', `${loc.file} has ${lines.length} lines; line ${loc.start} does not exist`, NOTE);
  }
  const lo = Math.max(0, loc.start - 1 - 3);
  const hi = Math.min(lines.length, loc.end + 3);
  const window = ws(lines.slice(lo, hi).join(' '));
  const q = ws(quote);
  if (q && window.includes(q)) {
    return mk(c, 'CITED', `${loc.file}:${loc.start} matches "${q.length > 40 ? q.slice(0, 40) + '…' : q}"`, NOTE, [`${loc.file}:${loc.start}`]);
  }
  const actual = ws(lines[loc.start - 1] ?? '');
  return mk(c, 'CONTRADICTED', `${loc.file}:${loc.start} does not contain "${q.length > 40 ? q.slice(0, 40) + '…' : q}" (line is: ${actual.slice(0, 60) || '<blank>'})`, NOTE);
}
