export interface Lexicon {
  universal: string[];
  testpass: string[];
  done: string[];
  judgment: string[];
}

export const DEFAULT_LEXICON: Lexicon = {
  universal: [
    'all', 'every', 'only', 'never', 'none', 'no other', 'nowhere', 'everywhere', 'always', 'entirely', 'completely',
    // Hinglish
    'sirf', 'saare', 'kahin nahi', 'kabhi nahi',
  ],
  testpass: [
    'tests pass', 'tests passed', 'tests passing', 'tests are passing', 'tests are green', 'test suite passes',
    'test suite passed', 'all tests pass', 'all green', 'build succeeds', 'build succeeded', 'build passes',
    'builds successfully', 'compiles cleanly', 'compiles without errors', 'tests all pass',
    // Hinglish
    'pass ho gaye', 'pass ho gaya', 'build ho gaya',
  ],
  done: ['fixed', 'resolved', 'removed all', 'renamed everywhere', 'fix ho gaya'],
  judgment: ['safe', 'secure', 'no side effects', "won't break", 'will not break', 'backward compatible', 'backwards compatible', 'no regression', 'no regressions'],
};

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const phrase = (list: string[]): RegExp | null => {
  const items = [...new Set(list.map((s) => s.trim()).filter(Boolean))].sort((a, b) => b.length - a.length);
  if (!items.length) return null;
  return new RegExp(`(?<![\\w])(?:${items.map((s) => esc(s).replace(/\s+/g, '\\s+')).join('|')})(?![\\w])`, 'i');
};

export interface Matchers {
  universal: RegExp | null;
  testpass: RegExp | null;
  done: RegExp | null;
  judgment: RegExp | null;
}

/** Generic "N tests pass" shapes that are not worth enumerating. */
const TESTPASS_EXTRA = /(?<![\w])(?:all\s+)?\d+\s+(?:unit\s+|integration\s+)?tests?\s+(?:are\s+)?(?:pass(?:es|ed|ing)?|green)(?![\w])/i;

export function buildMatchers(extraUniversal: string[] = [], extraJudge: string[] = []): Matchers {
  const lx = DEFAULT_LEXICON;
  return {
    universal: phrase([...lx.universal, ...extraUniversal]),
    testpass: phrase(lx.testpass),
    done: phrase(lx.done),
    judgment: phrase([...lx.judgment, ...extraJudge]),
  };
}

export const isTestPass = (m: Matchers, s: string): boolean => !!(m.testpass?.test(s) || TESTPASS_EXTRA.test(s));
export const hasUniversal = (m: Matchers, s: string): boolean => !!m.universal?.test(s);

const PATTERNS = [
  /(?:^|[\s(])((?:[\w.-]+\/)+[\w.-]+)/g,
  /\b([\w-]+\.(?:js|jsx|ts|tsx|mjs|cjs|py|go|java|rb|rs|php|json|md|ya?ml|toml|sh|css|html))\b/g,
  /\b([a-z][a-z0-9]*(?:[A-Z][a-z0-9]+)+)\b/g,
  /\b((?:[A-Z][a-z0-9]+){2,})\b/g,
  /\b([A-Za-z0-9]+(?:_[A-Za-z0-9]+)+)\b/g,
  /\b([A-Za-z_$][\w$]{1,}(?:\.[A-Za-z_$][\w$]{1,})+)\b/g,
];

/** Code identifiers mentioned in a sentence: backticked tokens, paths, camelCase, snake_case, dotted names. */
export function identifiers(sentence: string): string[] {
  const found = new Set<string>();
  const patterns = (text: string) => {
    for (const re of PATTERNS) for (const m of text.matchAll(re)) found.add(m[1]);
  };
  for (const m of sentence.matchAll(/`([^`\n]+)`/g)) {
    const tok = m[1].trim();
    // A simple name or path is one identifier; a code snippet (`return f(x)`) contributes the names inside it.
    if (/^[\w$./:@#-]+$/.test(tok)) found.add(tok);
    else patterns(tok);
  }
  const bare = sentence.replace(/`[^`\n]*`/g, ' ');
  patterns(bare);
  // `src/a.js:3`, `src/a.js:3-9` and `a.js#L3` name the file, not a new identifier.
  const strip = (id: string) => id.replace(/(?::\d+(?:-\d+)?|#L\d+(?:-L?\d+)?)$/, '');
  return [...new Set([...found].map(strip))].filter(Boolean);
}

const NEGATED = /\b(?:not|n't|never)\s+(?:all|every|entirely|completely|always|the\s+only|only)\b/i;
const NARROWING = [
  // the agent narrowing its own scope: "I only checked src/"
  /\b(?:I|we)\b[^.]{0,60}\bonly\s+(?:saw|checked|looked|read|ran|searched|tested|verified|reviewed|inspected|touched|edited|changed|modified|grepped|opened|examined|compared|fixed|removed|renamed|updated|did|had|used|covered)\b/i,
  // "true for src/a.js only"
  /\b(?:true|holds?|applies|valid|checked|verified|tested|searched|covers?|covered|done)\b[^.]{0,60}\bonly\s*[.;,)]?\s*$/i,
  /\bonly\s+(?:the\s+)?(?:last|first)\s+\d+/i,
];

/**
 * A universal word that is negated ("did not all pass") or narrows the agent's own
 * scope ("I only checked src/") is an admission, not a claim about the code.
 */
export function universalIsHedge(sentence: string): boolean {
  const prose = sentence.replace(/`[^`\n]*`/g, ' X ');
  return NEGATED.test(prose) || NARROWING.some((re) => re.test(prose));
}
