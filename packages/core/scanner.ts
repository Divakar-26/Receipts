import { Claim } from './types.js';
import { Matchers, hasUniversal, identifiers, isTestPass, universalIsHedge } from './lexicon.js';

/** Words inside `backticks` are code, not prose: `only` the type name is not the word only. */
const prose = (s: string) => s.replace(/`[^`\n]*`/g, ' X ');

export interface Flagged {
  sentence: string;
  kind: 'universal' | 'testpass';
  strong: boolean;
  identifiers: string[];
}
export interface Warning {
  sentence: string;
  category: 'universal' | 'testpass' | 'done' | 'judgment';
}

const FUTURE = /^(?:i'?ll|i will|i'?m going to|i am going to|we'?ll|we will|let me|next,?|then,?|should i|shall i|do you want|would you like|want me to|i can|i could|i would|i might|later,?|afterwards?)\b/i;

/** Split prose into sentences, skipping fenced code, blockquotes, quoted text, questions and future plans. */
export function sentences(outside: string): string[] {
  let text = outside.replace(/```[\s\S]*?(?:```|$)/g, '\n');
  text = text
    .split('\n')
    .filter((l) => !/^\s*>/.test(l))
    .join('\n');
  text = text.replace(/"[^"\n]{0,300}"/g, ' ').replace(/“[^”\n]{0,300}”/g, ' ');
  const out: string[] = [];
  for (const chunk of text.split(/\n+/)) {
    const line = chunk.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '').replace(/^#+\s*/, '').trim();
    if (!line) continue;
    for (const s of line.split(/(?<=[.!?])\s+(?=[A-Z0-9`"'(\[])/)) {
      const t = s.trim();
      if (!t || t.endsWith('?') || FUTURE.test(t)) continue;
      out.push(t);
    }
  }
  return out;
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').replace(/[`"'.]/g, '').trim();

/** Is this sentence already covered by a tagged claim? */
function covered(sentence: string, ids: string[], kind: 'universal' | 'testpass', tagged: Claim[]): boolean {
  const ns = norm(sentence);
  for (const c of tagged) {
    const nc = norm(c.text);
    if (nc.length > 8 && (ns.includes(nc) || nc.includes(ns))) return true;
  }
  if (kind === 'testpass') return tagged.some((c) => c.type === 'run');
  if (!ids.length) return false;
  return tagged.some((c) => {
    const hay = norm([c.text, ...Object.values(c.fields), c.loc ?? ''].join(' '));
    return ids.every((id) => hay.includes(norm(id)));
  });
}

export function scanProse(outside: string, tagged: Claim[], m: Matchers): { flagged: Flagged[]; warnings: Warning[] } {
  const flagged: Flagged[] = [];
  const warnings: Warning[] = [];
  const seen = new Set<string>();
  for (const s of sentences(outside)) {
    if (seen.has(s)) continue;
    seen.add(s);
    const ids = identifiers(s);
    const text = prose(s);
    if (isTestPass(m, text)) {
      if (!covered(s, ids, 'testpass', tagged)) flagged.push({ sentence: s, kind: 'testpass', strong: true, identifiers: ids });
      continue;
    }
    if (hasUniversal(m, text)) {
      if (universalIsHedge(s)) continue;
      if (ids.length) {
        if (!covered(s, ids, 'universal', tagged)) flagged.push({ sentence: s, kind: 'universal', strong: true, identifiers: ids });
      } else warnings.push({ sentence: s, category: 'universal' });
      continue;
    }
    if (m.done?.test(text)) warnings.push({ sentence: s, category: 'done' });
    else if (m.judgment?.test(text)) warnings.push({ sentence: s, category: 'judgment' });
  }
  return { flagged, warnings };
}

export type Gamed =
  | { kind: 'retype'; claim: Claim }
  | { kind: 'strong'; claim: Claim; why: string }
  | null;

const ONLY_RE = /\bonly\s+(?:called|used|referenced|imported|invoked|caller|callers|consumer|consumers|reference|references|usage|usages)\b|\bnot\s+(?:called|used|referenced)\s+(?:from|by|anywhere)\b/i;

function pickSymbol(text: string): string | null {
  const ids = identifiers(text).filter((i) => /^[A-Za-z_$][\w$]*$/.test(i));
  const ticked = [...text.matchAll(/`([A-Za-z_$][\w$]*)`/g)].map((m) => m[1]);
  const pool = ticked.length ? ticked : ids;
  return pool.length === 1 ? pool[0] : null;
}

/**
 * Type gaming: if a tagged claim's text implies a stronger type than its tag,
 * verify it as the stronger type. If the stronger check can't be built, the
 * claim is a strong untagged claim.
 */
export function typeGaming(c: Claim, m: Matchers, defaultTestCmd?: string): Gamed {
  if (c.type === 'run' || c.type === 'only' || c.type === 'absent' || c.type === 'change' || c.type === 'dep') return null;
  // judge/code claiming that tests pass -> run
  if (isTestPass(m, c.text)) {
    const cmd = c.fields.cmd || defaultTestCmd;
    if (!cmd) return { kind: 'strong', claim: c, why: 'says tests pass but names no `cmd:`' };
    return { kind: 'retype', claim: { ...c, type: 'run', fields: { ...c.fields, cmd }, originalType: c.type } };
  }
  if (c.type === 'code') {
    if (ONLY_RE.test(c.text)) {
      const sym = pickSymbol(c.text);
      const file = c.loc?.replace(/:\d+(?:-\d+)?$/, '');
      if (!sym || !file) return { kind: 'strong', claim: c, why: "'only' claim cited as a single code line" };
      return { kind: 'retype', claim: { ...c, type: 'only', fields: { ...c.fields, symbol: sym, in: file }, originalType: 'code' } };
    }
    if (hasUniversal(m, c.text) && identifiers(c.text).length) {
      return { kind: 'strong', claim: c, why: 'universal claim cited as a single code line' };
    }
  }
  return null;
}
