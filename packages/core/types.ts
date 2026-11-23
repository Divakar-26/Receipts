export type ClaimType = 'code' | 'run' | 'absent' | 'only' | 'change' | 'dep' | 'judge';
export const CLAIM_TYPES: readonly ClaimType[] = ['code', 'run', 'absent', 'only', 'change', 'dep', 'judge'];

export type Label = 'VERIFIED' | 'CITED' | 'CONTRADICTED' | 'UNVERIFIED';

export interface Claim {
  type: ClaimType | 'untagged';
  text: string;
  fields: Record<string, string>;
  /** `path:line` location for `code` claims. */
  loc?: string;
  /** 1-based line inside the receipts block (0 for scanner-made claims). */
  line: number;
  /** Set when the claim was re-typed by the type-gaming rule. */
  originalType?: ClaimType | 'untagged';
  /** The line had keys but no claim text (e.g. `run | cmd: make test`): it records an action, it asserts no outcome. */
  textless?: boolean;
}

export type Reason =
  | 'timeout'
  | 'stale'
  | 'masked'
  | 'untagged'
  | 'unprovable'
  | 'invalid'
  | 'unchecked'
  | 'subset'
  | 'never-ran';

export interface Result {
  claim: Claim;
  label: Label;
  /** One short line for the report. */
  summary: string;
  evidence: string[];
  /** What the check could not cover. */
  note: string;
  reason?: Reason;
  stale?: boolean;
  /** A strong claim with no receipt. Blocks. */
  strong?: boolean;
  universal?: boolean;
  /** The type the claim was actually verified as (type gaming). */
  checkedAs?: ClaimType;
}

export interface TestSummary {
  runner: string;
  passed: number;
  failed: number;
  skipped: number;
  /** Tests the runner reported as filtered out (cargo). */
  filtered?: number;
  unit?: 'tests' | 'packages';
}

export interface LedgerShell {
  session: string;
  ts: string;
  agent: string;
  kind: 'shell';
  cmd: string;
  exit: number | null;
  exit_trusted: boolean;
  summary?: TestSummary | null;
  out_tail?: string;
  snap?: string | null;
  /** Set when the snapshot is taken by a detached worker after the hook returned; its `snap` line is merged on read. */
  snap_id?: string;
}
export interface LedgerWeb {
  session: string;
  ts: string;
  agent: string;
  kind: 'web';
  url: string;
}
export type LedgerEntry = LedgerShell | LedgerWeb;

export type Mode = 'block' | 'warn' | 'strict';

export interface Config {
  mode: Mode;
  testCommand?: string;
  buildCommand?: string;
  ignore: string[];
  lexicon: { extraUniversal: string[]; extraJudge: string[] };
  maxRetries: number;
  /** In `block`/`strict` mode, do strong claims without a receipt block (`block`, the spec default) or only get reported? */
  untaggedClaims: 'block' | 'report';
}

export const DEFAULT_CONFIG: Config = {
  // `warn` per the benchmark ship rule: the benchmark measured a 100% false-block rate for `block` (bench/README.md).
  mode: 'warn',
  ignore: [],
  lexicon: { extraUniversal: [], extraJudge: [] },
  maxRetries: 1,
  untaggedClaims: 'block',
};
