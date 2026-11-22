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

/** Code identifiers mentioned in a sentence: backticked tokens, paths, camelCase, snake_case, dotted names. */
export function identifiers(sentence: string): string[] {
  const found = new Set<string>();
  for (const m of sentence.matchAll(/`([^`\n]+)`/g)) found.add(m[1].trim());
  const bare = sentence.replace(/`[^`\n]*`/g, ' ');
  const pats = [
    /(?:^|[\s(])((?:[\w.-]+\/)+[\w.-]+)/g,
    /\b([\w-]+\.(?:js|jsx|ts|tsx|mjs|cjs|py|go|java|rb|rs|php|json|md|ya?ml|toml|sh|css|html))\b/g,
    /\b([a-z][a-z0-9]*(?:[A-Z][a-z0-9]+)+)\b/g,
    /\b((?:[A-Z][a-z0-9]+){2,})\b/g,
    /\b([A-Za-z0-9]+(?:_[A-Za-z0-9]+)+)\b/g,
    /\b([A-Za-z_$][\w$]{1,}(?:\.[A-Za-z_$][\w$]{1,})+)\b/g,
  ];
  for (const re of pats) for (const m of bare.matchAll(re)) found.add(m[1]);
  return [...found].filter(Boolean);
}
