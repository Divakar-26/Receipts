import * as fs from 'node:fs';
import * as path from 'node:path';
import { Claim, Result } from '../types.js';
import { search, Hit } from '../search.js';
import { classifyHits, isCodeFile } from '../syntax.js';
import { Ctx, listHits, mk, unverified } from './ctx.js';

const NOTE = 'static search; dynamic calls (obj[name](), reflection, string-built names, re-exports under other names) not ruled out';
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function isDefinition(line: string, sym: string): boolean {
  const s = esc(sym);
  const alts = [
    `\\b(?:function\\*?|def|func|class|interface|struct|enum|fn)\\s+(?:\\([^)]*\\)\\s*)?${s}\\b`,
    `\\b(?:const|let|var)\\s+${s}\\s*(?::[^=]+)?=\\s*(?:async\\s*)?(?:function\\b|\\([^)]*\\)\\s*(?::[^=]+)?=>|[\\w$]+\\s*=>)`,
    `\\b${s}\\s*[:=]\\s*(?:async\\s*)?(?:function\\b|\\([^)]*\\)\\s*=>)`,
    `^\\s*(?:(?:public|private|protected|static|final|abstract|async|export|default|override)\\s+)*(?:async\\s+)?${s}\\s*\\([^)]*\\)\\s*(?::\\s*[\\w<>\\[\\]|., ]+)?\\s*\\{\\s*$`,
    `^\\s*(?:(?:public|private|protected|static|final|abstract|synchronized)\\s+)+[\\w<>\\[\\],.?]+\\s+${s}\\s*\\([^)]*\\)\\s*(?:throws [\\w., ]+)?\\s*\\{?\\s*$`,
  ];
  return new RegExp(alts.join('|')).test(line);
}

/** `module.exports = { sym }`, `export { sym }`, `exports.sym = sym`, `__all__ = [...]`. */
export function isExportLine(line: string): boolean {
  return /^\s*(?:module\.)?exports\b/.test(line) || /^\s*export\s*(?:default\s+)?\{/.test(line) || /^\s*__all__\b/.test(line) || /^\s*export\s+default\s+[\w$]+\s*;?\s*$/.test(line);
}

function normalisePath(p: string): string {
  return p.trim().replace(/:\d+(?:-\d+)?$/, '').replace(/^\.\//, '').replace(/\/+$/, '');
}
const inScope = (file: string, scope: string[]) => scope.some((s) => file === s || file.startsWith(s + '/'));

export async function verifyOnly(c: Claim, ctx: Ctx): Promise<Result> {
  const sym = c.fields.symbol;
  if (!/^[\w$.:-]{1,120}$/.test(sym)) return unverified(c, 'invalid', `symbol \`${sym.slice(0, 40)}\` is not a plain identifier`, NOTE);
  const scope = c.fields.in.split(',').map(normalisePath).filter(Boolean);
  const r = await search(ctx.root, { pattern: sym, fixed: true, word: true, ignore: ctx.config.ignore, deadline: ctx.deadline, maxHits: 400 });
  if (r.timedOut) return unverified(c, 'timeout', `\`${sym}\`: search timed out`, NOTE);
  if (r.error) return unverified(c, 'invalid', `\`${sym}\`: ${r.error}`, NOTE);

  const byFile = new Map<string, Hit[]>();
  for (const h of r.hits) {
    const a = byFile.get(h.file) ?? [];
    a.push(h);
    byFile.set(h.file, a);
  }
  const outside: Hit[] = [];
  const warn: Hit[] = [];
  let ignoredStrCom = 0;
  let nonCode = 0;
  let inside = 0;
  for (const [file, hits] of [...byFile].slice(0, 300)) {
    const definesHere = hits.some((h) => isDefinition(h.text, sym));
    const defless = hits.filter((h) => !isDefinition(h.text, sym) && !(definesHere && isExportLine(h.text)));
    if (inScope(file, scope)) {
      inside += defless.length;
      continue;
    }
    if (!defless.length) continue;
    if (!isCodeFile(file)) {
      nonCode += defless.length;
      continue;
    }
    let content: string;
    try {
      content = fs.readFileSync(path.join(ctx.root, file), 'utf8');
    } catch {
      outside.push(...defless);
      continue;
    }
    const cls = await classifyHits(file, content, defless.map((h) => h.line), sym);
    for (const h of defless) {
      if (cls.code.includes(h.line)) outside.push(h);
      else {
        const o = cls.other.find((x) => x.line === h.line);
        if (o?.kind === 'comment' && !cls.viaTreeSitter) warn.push(h);
        else ignoredStrCom++;
      }
    }
  }
  const extra: string[] = [];
  if (ignoredStrCom) extra.push(`${ignoredStrCom} mention(s) in strings/comments ignored`);
  if (nonCode) extra.push(`${nonCode} in non-code files ignored`);
  if (warn.length) extra.push(`${warn.length} comment-only match(es) in unparsed languages (warning): ${listHits(warn, 3)}`);
  if (r.truncated) extra.push('search truncated at 400 hits');
  const note = NOTE + (extra.length ? '. ' + extra.join('; ') : '');
  if (outside.length) {
    return mk(c, 'CONTRADICTED', `\`${sym}\` also referenced outside ${scope.join(', ')}: ${listHits(outside)}`, note, outside.slice(0, 10).map((h) => `${h.file}:${h.line}: ${h.text.trim().slice(0, 100)}`));
  }
  if (inside === 0) {
    return unverified(c, 'unchecked', `no references to \`${sym}\` found in ${scope.join(', ')} either`, note);
  }
  return mk(c, 'VERIFIED', `\`${sym}\` has no references outside ${scope.join(', ')} (${inside} inside)`, note);
}
