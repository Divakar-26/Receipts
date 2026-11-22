import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Classifies each occurrence of a symbol on a line as code / string / comment.
 * tree-sitter (WASM) for JS/TS, Python, Go, Java; a comment-stripping
 * heuristic for everything else.
 */
export type Kind = 'code' | 'string' | 'comment';

const EXT_LANG: Record<string, string> = {
  '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
  '.ts': 'typescript', '.mts': 'typescript', '.cts': 'typescript', '.tsx': 'tsx',
  '.py': 'python', '.go': 'go', '.java': 'java',
};

export const CODE_EXTS = new Set([
  ...Object.keys(EXT_LANG),
  '.kt', '.kts', '.rb', '.rs', '.php', '.c', '.h', '.cc', '.cpp', '.hpp', '.cs', '.swift', '.scala', '.sh', '.bash',
  '.lua', '.vue', '.svelte', '.dart', '.ex', '.exs', '.pl', '.r', '.m',
]);

export function isCodeFile(file: string): boolean {
  return CODE_EXTS.has(path.extname(file).toLowerCase());
}
export function languageFor(file: string): string | null {
  return EXT_LANG[path.extname(file).toLowerCase()] ?? null;
}

const COMMENT_NODES = new Set(['comment', 'line_comment', 'block_comment', 'documentation_comment']);
const STRING_NODES = new Set([
  'string', 'string_fragment', 'string_content', 'template_string', 'string_literal', 'interpreted_string_literal',
  'raw_string_literal', 'character_literal', 'regex', 'regex_pattern', 'concatenated_string', 'string_start', 'string_end',
  'escape_sequence', 'rune_literal', 'text_block',
]);
const CODE_INSIDE_STRING = new Set(['template_substitution', 'interpolation']);

type TSParser = { setLanguage(l: unknown): void; parse(s: string): { rootNode: TSNode; delete(): void } };
interface TSNode {
  type: string;
  parent: TSNode | null;
  descendantForPosition(p: { row: number; column: number }): TSNode;
}

let initPromise: Promise<unknown> | null = null;
const parsers = new Map<string, TSParser | null>();

async function getParser(lang: string): Promise<TSParser | null> {
  if (parsers.has(lang)) return parsers.get(lang) ?? null;
  try {
    const W = (await import('web-tree-sitter')) as unknown as {
      Parser: { init(): Promise<void>; new (): TSParser };
      Language: { load(p: string): Promise<unknown> };
    };
    initPromise ??= W.Parser.init();
    await initPromise;
    const wasm = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'grammars', `tree-sitter-${lang}.wasm`);
    const L = await W.Language.load(wasm);
    const p = new W.Parser();
    p.setLanguage(L);
    parsers.set(lang, p);
    return p;
  } catch {
    parsers.set(lang, null);
    return null;
  }
}

/** All start indexes of `symbol` in `line` as a whole word. */
export function occurrences(line: string, symbol: string): number[] {
  const out: number[] = [];
  const isW = (c: string | undefined) => !!c && /[A-Za-z0-9_$]/.test(c);
  let i = 0;
  while ((i = line.indexOf(symbol, i)) >= 0) {
    const before = line[i - 1];
    const after = line[i + symbol.length];
    const startsW = isW(symbol[0]);
    const endsW = isW(symbol[symbol.length - 1]);
    if (!(startsW && isW(before)) && !(endsW && isW(after))) out.push(i);
    i += Math.max(1, symbol.length);
  }
  return out;
}

const SLASH = new Set(['.c', '.h', '.cc', '.cpp', '.hpp', '.cs', '.rs', '.swift', '.scala', '.kt', '.kts', '.php', '.dart', '.vue', '.svelte']);
const HASH = new Set(['.rb', '.sh', '.bash', '.pl', '.r', '.ex', '.exs']);

/** Heuristic: is the occurrence at `idx` inside a comment? Good enough, not a parser. */
export function heuristicKind(line: string, idx: number, ext: string): Kind {
  const t = line.trimStart();
  if (t.startsWith('*') || t.startsWith('/*') || t.startsWith('*/')) return 'comment';
  let q = '';
  for (let i = 0; i < idx; i++) {
    const c = line[i];
    if (q) {
      if (c === '\\') i++;
      else if (c === q) q = '';
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      q = c;
      continue;
    }
    if ((SLASH.has(ext) || !HASH.has(ext)) && c === '/' && line[i + 1] === '/') return 'comment';
    if (c === '/' && line[i + 1] === '*') return 'comment';
    if ((HASH.has(ext) || !SLASH.has(ext)) && c === '#' && (i === 0 || /\s/.test(line[i - 1]))) return 'comment';
    if (ext === '.lua' && c === '-' && line[i + 1] === '-') return 'comment';
  }
  return q ? 'string' : 'code';
}

export interface FileClass {
  code: number[];
  other: { line: number; kind: Kind }[];
  viaTreeSitter: boolean;
}

/**
 * For each hit line in a file, decide whether the symbol occurs in code.
 * `lines` are the 1-based line numbers of hits; `content` is the file text.
 */
export async function classifyHits(file: string, content: string, lines: number[], symbol: string): Promise<FileClass> {
  const ext = path.extname(file).toLowerCase();
  const lang = languageFor(file);
  const all = content.split(/\r?\n/);
  const res: FileClass = { code: [], other: [], viaTreeSitter: false };
  let tree: { rootNode: TSNode; delete(): void } | null = null;
  if (lang) {
    const p = await getParser(lang);
    if (p) {
      try {
        tree = p.parse(content);
        res.viaTreeSitter = true;
      } catch {
        tree = null;
      }
    }
  }
  for (const ln of lines) {
    const text = all[ln - 1] ?? '';
    const occ = occurrences(text, symbol);
    let kind: Kind = occ.length ? 'comment' : 'code';
    if (!occ.length) kind = 'code'; // regex hit without a boundary match: keep it conservative
    for (const col of occ) {
      let k: Kind;
      if (tree) {
        k = 'code';
        let n: TSNode | null = tree.rootNode.descendantForPosition({ row: ln - 1, column: col });
        while (n) {
          if (CODE_INSIDE_STRING.has(n.type)) break;
          if (COMMENT_NODES.has(n.type)) {
            k = 'comment';
            break;
          }
          if (STRING_NODES.has(n.type)) {
            k = 'string';
            break;
          }
          n = n.parent;
        }
      } else {
        k = heuristicKind(text, col, ext);
      }
      if (k === 'code') {
        kind = 'code';
        break;
      }
      kind = k === 'string' && kind === 'comment' ? 'string' : kind;
    }
    if (kind === 'code') res.code.push(ln);
    else res.other.push({ line: ln, kind });
  }
  tree?.delete();
  return res;
}
