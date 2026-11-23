/**
 * Command-line analysis. Pure string work; never executes anything.
 * Used by the ledger hook (tiny) and by the `run` verifier.
 */

export type Op = '' | '&&' | '||' | '|' | ';' | '&';
export interface Segment {
  text: string;
  op: Op;
}

/** Split on shell operators, honouring quotes. `2>&1` and `&>` are not operators. */
export function splitShell(cmd: string): Segment[] {
  const out: Segment[] = [];
  let cur = '';
  let q: '' | "'" | '"' = '';
  const push = (op: Op) => {
    out.push({ text: cur.trim(), op });
    cur = '';
  };
  // Pending here-documents (`cat > f <<'EOF'`): their bodies are data, not commands.
  const heredocs: { delim: string; dash: boolean }[] = [];
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (q) {
      cur += c;
      if (c === '\\' && q === '"' && i + 1 < cmd.length) cur += cmd[++i];
      else if (c === q) q = '';
      continue;
    }
    if (c === '\\') {
      cur += c + (cmd[i + 1] ?? '');
      i++;
      continue;
    }
    if (c === "'" || c === '"') {
      q = c;
      cur += c;
      continue;
    }
    if (c === '<' && cmd[i + 1] === '<' && cmd[i + 2] !== '<') {
      let j = i + 2;
      const dash = cmd[j] === '-';
      if (dash) j++;
      while (cmd[j] === ' ' || cmd[j] === '\t') j++;
      const m = /^(['"]?)([A-Za-z_][A-Za-z0-9_.-]*)\1/.exec(cmd.slice(j));
      if (m) {
        heredocs.push({ delim: m[2], dash });
        cur += cmd.slice(i, j + m[0].length);
        i = j + m[0].length - 1;
        continue;
      }
    }
    if (c === '\n' || c === ';') {
      push(';');
      if (c === '\n' && heredocs.length) {
        // skip each body up to and including its delimiter line
        let pos = i + 1;
        for (const h of heredocs) {
          while (pos <= cmd.length) {
            const end = cmd.indexOf('\n', pos);
            const line = cmd.slice(pos, end < 0 ? cmd.length : end);
            pos = end < 0 ? cmd.length + 1 : end + 1;
            if ((h.dash ? line.replace(/^\t+/, '') : line) === h.delim) break;
          }
        }
        heredocs.length = 0;
        i = Math.min(pos, cmd.length + 1) - 1;
      }
      continue;
    }
    if (c === '&') {
      if (cmd[i + 1] === '&') {
        push('&&');
        i++;
        continue;
      }
      if (cur.endsWith('>') || cmd[i + 1] === '>') {
        cur += c;
        continue;
      }
      push('&');
      continue;
    }
    if (c === '|') {
      if (cmd[i + 1] === '|') {
        push('||');
        i++;
        continue;
      }
      if (cmd[i + 1] === '&') i++; // |&
      push('|');
      continue;
    }
    cur += c;
  }
  push('');
  // Drop empty segments but keep the operator that preceded them meaningful:
  // `cmd &` keeps op '&'; `cmd;` keeps ';' with nothing after it.
  return out.filter((s) => s.text !== '' || false);
}

/** Split into words, honouring quotes (quotes are stripped). */
export function words(s: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = '';
  let has = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === q) q = '';
      else if (c === '\\' && q === '"' && i + 1 < s.length) cur += s[++i];
      else cur += c;
      continue;
    }
    if (c === '"' || c === "'") {
      q = c;
      has = true;
      continue;
    }
    if (c === '\\' && i + 1 < s.length) {
      cur += s[++i];
      has = true;
      continue;
    }
    if (/\s/.test(c)) {
      if (cur || has) out.push(cur);
      cur = '';
      has = false;
      continue;
    }
    cur += c;
    has = true;
  }
  if (cur || has) out.push(cur);
  return out;
}

/** Normalise one segment for comparison. */
export function normaliseSegment(seg: string): string {
  let s = seg.trim().replace(/\s+/g, ' ');
  s = s.replace(/\s*\d?>+\s*(&\d|\/dev\/null)\b/g, '').replace(/\s+2>&1\b/g, '');
  while (/^[A-Za-z_][A-Za-z0-9_]*=\S*\s+/.test(s)) s = s.replace(/^[A-Za-z_][A-Za-z0-9_]*=\S*\s+/, '');
  s = s.replace(/^npm (run|run-script) test\b/, 'npm test').replace(/^npm t\b/, 'npm test');
  return s.trim();
}

/** `receipts run -- cmd` is transparent: unwrap it. */
export function unwrapReceiptsRun(cmd: string): string {
  const m = /^\s*(?:npx\s+(?:-y\s+)?)?(?:@receipts\/cli|receipts)\s+run\s+(?:--\s+)?([\s\S]+)$/.exec(cmd);
  return m ? m[1] : cmd;
}

export interface SegmentInfo {
  text: string;
  norm: string;
  /** The exit status reported for the whole command does not reflect this segment. */
  masked: boolean;
  maskReason?: string;
}

export function analyseCommand(cmd: string): SegmentInfo[] {
  const raw = splitShell(unwrapReceiptsRun(cmd));
  const all = raw.map((s) => s.text);
  const setPlusE = all.some((t) => /^set\s+(?:\S+\s+)*\+[a-z]*e\b/.test(t));
  const pipefail = all.some((t) => /^set\s+.*pipefail/.test(t));
  const infos: SegmentInfo[] = [];
  for (let i = 0; i < raw.length; i++) {
    let masked = false;
    let maskReason: string | undefined;
    if (setPlusE) {
      masked = true;
      maskReason = 'set +e';
    }
    for (let j = i; j < raw.length && !masked; j++) {
      const op = raw[j].op;
      if (op === '&&') break;
      const more = raw.slice(j + 1).some((s) => s.text !== '');
      if (op === '|' && !pipefail) {
        masked = true;
        maskReason = 'piped';
      } else if (op === '||') {
        masked = true;
        maskReason = '|| fallback';
      } else if (op === '&') {
        masked = true;
        maskReason = 'backgrounded';
      } else if (op === ';' && more) {
        masked = true;
        maskReason = 'followed by ;';
      }
    }
    infos.push({ text: raw[i].text, norm: normaliseSegment(raw[i].text), masked, maskReason });
  }
  return infos;
}

const TEST_RE =
  /^(?:(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:test|t)\b|(?:npx\s+|pnpx\s+|bunx\s+)?(?:jest|vitest|mocha|ava)\b|(?:python3?\s+-m\s+)?(?:pytest|py\.test|unittest)\b|go\s+test\b|cargo\s+(?:test|nextest)\b|(?:\.\/)?mvnw?\s+.*\b(?:test|verify)\b|(?:\.\/)?gradlew?\s+.*\b(?:test|check)\b|(?:bundle\s+exec\s+)?rspec\b|(?:vendor\/bin\/)?phpunit\b|node\s+(?:\S+\s+)*--test\b|make\s+(?:test|check)\b|tox\b)/;
const BUILD_RE =
  /^(?:(?:npm|pnpm|yarn|bun)\s+run\s+build\b|(?:npx\s+)?tsc\b|(?:npx\s+)?(?:next|vite|webpack|rollup|esbuild)\s+build\b|go\s+(?:build|vet)\b|cargo\s+(?:build|check)\b|(?:\.\/)?mvnw?\s+.*\b(?:compile|package|install)\b|(?:\.\/)?gradlew?\s+.*\bbuild\b|make(?:\s+build|\s+all)?$)/;

export function isTestCmd(norm: string): boolean {
  return TEST_RE.test(norm);
}
export function isBuildCmd(norm: string): boolean {
  return BUILD_RE.test(norm);
}

export interface CmdConfig {
  testCommand?: string;
  buildCommand?: string;
}

export function isTestOrBuildSegment(norm: string, cfg: CmdConfig = {}): boolean {
  const t = cfg.testCommand ? normaliseSegment(cfg.testCommand) : null;
  const b = cfg.buildCommand ? normaliseSegment(cfg.buildCommand) : null;
  return norm === t || norm === b || isTestCmd(norm) || isBuildCmd(norm);
}

/** Is the whole command a test or build command (any segment)? */
export function isTestOrBuild(cmd: string, cfg: CmdConfig = {}): boolean {
  return analyseCommand(cmd).some((s) => isTestOrBuildSegment(s.norm, cfg));
}

/**
 * Is the exit code of the whole command trustworthy for the command that
 * matters (the last test/build segment, else the last segment)?
 */
export function exitTrusted(cmd: string, cfg: CmdConfig = {}): boolean {
  const segs = analyseCommand(cmd);
  if (!segs.length) return false;
  let idx = segs.length - 1;
  for (let i = segs.length - 1; i >= 0; i--) {
    if (isTestOrBuildSegment(segs[i].norm, cfg)) {
      idx = i;
      break;
    }
  }
  return !segs[idx].masked;
}

const FILTER_FLAGS = [
  '-t',
  '--testNamePattern',
  '--test-name-pattern',
  '--grep',
  '-g',
  '-k',
  '-m',
  '-run',
  '--run',
  '--filter',
  '--testPathPattern',
  '--testPathPatterns',
  '--only',
  '--tests',
  '--test',
  '-Dtest',
  '-pl',
  '--lf',
  '--last-failed',
  '--ff',
  '--onlyChanged',
  '--changedSince',
  '--findRelatedTests',
];

/** If a test command only runs part of the suite, say why. */
export function detectFilter(norm: string): string | null {
  let w = words(norm);
  if (!w.length) return null;
  let family = w[0];
  let rest: string[];
  if (['npm', 'pnpm', 'yarn', 'bun'].includes(w[0])) {
    family = 'script';
    let i = 1;
    if (w[i] === 'run') i++;
    rest = w.slice(i + 1); // after the script name
  } else {
    if (['npx', 'pnpx', 'bunx'].includes(w[0])) w = w.slice(1);
    if (/^python3?$/.test(w[0]) && w[1] === '-m') w = w.slice(2);
    if (w[0] === 'bundle' && w[1] === 'exec') w = w.slice(2);
    family = w[0].replace(/^.*\//, '');
    rest = w.slice(1);
  }
  let prevWasFlag = false;
  for (const tok of rest) {
    if (tok.includes('::')) return `test selector \`${tok}\``;
    if (tok.startsWith('-')) {
      const name = tok.replace(/=.*$/, '');
      if (family === 'node' && name === '--test') continue; // node's own runner switch
      if (FILTER_FLAGS.includes(name) || FILTER_FLAGS.some((f) => f.startsWith('-D') && tok.startsWith(f))) {
        return `filter flag \`${name}\``;
      }
      prevWasFlag = tok === '--' ? false : !tok.includes('=');
      continue;
    }
    const positional = !prevWasFlag;
    prevWasFlag = false;
    if (!positional) continue;
    const isFileLike = /\.[A-Za-z0-9]{1,5}$/.test(tok) || tok.includes('*');
    switch (family) {
      case 'go':
        if (tok === 'test') break;
        if (tok !== './...' && tok !== '.') return `package argument \`${tok}\``;
        break;
      case 'mvn':
      case 'mvnw':
      case 'gradle':
      case 'gradlew':
      case 'make':
        break;
      case 'pytest':
      case 'py.test':
      case 'unittest':
      case 'tox':
        if (isFileLike) return `test file argument \`${tok}\``;
        break;
      case 'cargo':
        if (tok === 'test' || tok === 'nextest' || tok === 'run') break;
        return `test name filter \`${tok}\``;
      case 'node':
        if (isFileLike) return `test file argument \`${tok}\``;
        break;
      default:
        return `test selector argument \`${tok}\``;
    }
  }
  return null;
}

/**
 * Identifies the test runner behind a command, ignoring wrappers and flags:
 * `python3 -m pytest -q tests` and `pytest` are both "pytest"; `npm run test -- --coverage` is "npm test".
 */
export function runnerKey(norm: string): string {
  let w = words(norm);
  while (w.length && ['npx', 'pnpx', 'bunx', 'bundle', 'exec', 'sudo', 'time'].includes(w[0])) w = w.slice(1);
  if (/^python3?$/.test(w[0] ?? '') && w[1] === '-m') w = w.slice(2);
  const first = (w[0] ?? '').replace(/^\.\//, '').replace(/^.*\//, '');
  if (['npm', 'pnpm', 'yarn', 'bun', 'go', 'cargo', 'make'].includes(first)) return `${first} ${w[1] === 'run' ? (w[2] ?? '') : (w[1] ?? '')}`.trim();
  return first;
}
