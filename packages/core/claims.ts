import { Claim, CLAIM_TYPES, ClaimType } from './types.js';

export interface ParsedMessage {
  /** Parsed, well-formed claims from the LAST receipts block. */
  claims: Claim[];
  /** Lines in the block that did not parse. Their text still gets scanned. */
  untagged: Claim[];
  /** The message with every receipts block removed. */
  outside: string;
  hasBlock: boolean;
}

const BLOCK_RE = /<receipts>([\s\S]*?)(?:<\/receipts>|$)/gi;
const KEYS = ['quote', 'cmd', 'pattern', 'symbol', 'in', 'old', 'new', 'name', 'source', 'version'];
const KEY_RE = new RegExp(`^(${KEYS.join('|')}):\\s*([\\s\\S]*)$`);
const LOC_RE = /^(.+?):(\d+)(?:-(\d+))?$/;

/** Split on `|`, treating `\|` as a literal pipe. */
export function splitFields(line: string): string[] {
  const parts: string[] = [];
  let cur = '';
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '\\' && line[i + 1] === '|') {
      cur += '|';
      i++;
    } else if (c === '|') {
      parts.push(cur);
      cur = '';
    } else cur += c;
  }
  parts.push(cur);
  return parts.map((p) => p.trim());
}

const REQUIRED: Record<ClaimType, string[]> = {
  code: ['quote'],
  run: ['cmd'],
  absent: ['pattern'],
  only: ['symbol', 'in'],
  change: ['old', 'new'],
  dep: ['name'],
  judge: [],
};

export function parseLine(raw: string, lineNo: number): Claim {
  const untagged = (): Claim => ({ type: 'untagged', text: raw.trim(), fields: {}, line: lineNo });
  const parts = splitFields(raw);
  const type = parts[0]?.toLowerCase() as ClaimType;
  if (!CLAIM_TYPES.includes(type)) return untagged();
  const text = parts[1];
  if (!text) return untagged();
  const fields: Record<string, string> = {};
  let loc: string | undefined;
  for (const p of parts.slice(2)) {
    const k = KEY_RE.exec(p);
    if (k) fields[k[1]] = k[2].trim();
    else if (type === 'code' && !loc && LOC_RE.test(p)) loc = p;
  }
  if (type === 'code' && !loc) return { ...untagged(), text: raw.trim() };
  for (const key of REQUIRED[type]) if (!fields[key]) return untagged();
  if (type === 'code' && !fields.quote) return untagged();
  return { type, text, fields, loc, line: lineNo };
}

export function parseMessage(message: string): ParsedMessage {
  const blocks: string[] = [];
  const outside = message.replace(BLOCK_RE, (_m, body: string) => {
    blocks.push(body);
    return '\n';
  });
  if (!blocks.length) return { claims: [], untagged: [], outside: message, hasBlock: false };
  const body = blocks[blocks.length - 1];
  const claims: Claim[] = [];
  const untagged: Claim[] = [];
  body.split(/\r?\n/).forEach((raw, i) => {
    if (!raw.trim()) return;
    const c = parseLine(raw, i + 1);
    (c.type === 'untagged' ? untagged : claims).push(c);
  });
  return { claims, untagged, outside, hasBlock: true };
}

export function parseLoc(loc: string): { file: string; start: number; end: number } | null {
  const m = LOC_RE.exec(loc);
  if (!m) return null;
  const start = parseInt(m[2], 10);
  return { file: m[1], start, end: m[3] ? parseInt(m[3], 10) : start };
}
