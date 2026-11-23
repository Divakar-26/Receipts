import { Claim } from './types.js';

/**
 * Some claims written in prose name exactly what to check. Rather than reporting them as "no receipt", the checker
 * builds the receipt itself and verifies it (the agent still does not grade its own homework):
 *   "I renamed `getUser` to `fetchUser` everywhere"          -> change  old: getUser new: fetchUser
 *   "`getUser` no longer appears anywhere"                     -> absent  \bgetUser\b
 *   "nothing still refers to `getUser`"                       -> absent  \bgetUser\b
 *   "`semver` is already declared" / "already a dependency"   -> dep     semver
 */
const IDENT = String.raw`([A-Za-z_$][\w$.]*)`;
const RENAME = new RegExp(String.raw`\brenamed\s+\x60${IDENT}\x60\s+(?:to|as|into)\s+\x60${IDENT}\x60`, 'i');
const RENAME_UNIVERSAL = /\b(everywhere|all|every|across|nothing|no longer|anywhere)\b/i;
const GONE = new RegExp(
  String.raw`\x60${IDENT}\x60[^.]{0,40}?\b(?:no longer (?:appears|exists|is (?:used|referenced|imported|called|mentioned))|(?:appears|is (?:used|referenced|mentioned)) nowhere|is (?:gone|not (?:used|referenced|imported|called|mentioned) anywhere)|isn't (?:used|referenced|imported|called|mentioned) anywhere)`,
  'i',
);
const NOTHING_REFS = new RegExp(String.raw`\b(?:nothing|no (?:other )?(?:code|file))\b[^.]{0,40}?\b(?:refers to|references|uses|calls|imports|depends on|mentions)\s+\x60${IDENT}\x60`, 'i');
const DEP = /`(@?[\w./-]+)`[^.]{0,40}?\b(?:is|was|were)\s+already\s+(?:declared|listed|a (?:direct |project )?dependency|in (?:package\.json|requirements\.txt|go\.mod|pyproject\.toml|Cargo\.toml))/i;

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordPattern = (id: string) => `\\b${esc(id)}\\b`;

/** For a universal sentence the scanner flagged: a check the checker can run itself, or null. */
export function autoClaimForUniversal(sentence: string): Claim | null {
  const base = { text: sentence, line: 0, originalType: 'untagged' as const };
  const rn = RENAME.exec(sentence);
  if (rn && RENAME_UNIVERSAL.test(sentence.replace(/`[^`]*`/g, ' '))) return { ...base, type: 'change', fields: { old: rn[1], new: rn[2] } };
  const gone = GONE.exec(sentence) ?? NOTHING_REFS.exec(sentence);
  if (gone) return { ...base, type: 'absent', fields: { pattern: wordPattern(gone[1]) } };
  return null;
}

/** "`x` is already declared": a dependency claim in prose (no universal word, so the scanner never flags it). */
export function autoClaimForDependency(sentence: string): Claim | null {
  const m = DEP.exec(sentence);
  return m ? { type: 'dep', text: sentence, fields: { name: m[1] }, line: 0, originalType: 'untagged' } : null;
}
