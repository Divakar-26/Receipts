import { execFile } from 'node:child_process';

export interface Hit {
  file: string;
  line: number;
  text: string;
}
export interface SearchOptions {
  pattern: string;
  /** Treat the pattern as a literal string. */
  fixed?: boolean;
  /** Match whole words only. */
  word?: boolean;
  ignore: string[];
  /** Absolute epoch ms after which we give up. */
  deadline: number;
  maxHits?: number;
  /** Also search files that .gitignore excludes (default ignores such as node_modules still apply). */
  includeIgnored?: boolean;
}
export interface SearchResult {
  hits: Hit[];
  truncated: boolean;
  engine: 'rg' | 'git-grep' | 'none';
  error?: string;
  timedOut?: boolean;
}

/** Includes Receipts' own installed skill, whose examples would otherwise match every search. */
const DEFAULT_IGNORES = ['.git', '.hg', '.svn', '.receipts', 'node_modules', '.claude/skills/receipts'];
const MAX_BUFFER = 64 * 1024 * 1024;

let rgPathCache: string | null | undefined;
async function findRg(): Promise<string | null> {
  if (process.env.RECEIPTS_RG) return process.env.RECEIPTS_RG;
  if (rgPathCache !== undefined) return rgPathCache;
  try {
    const m = await import('@vscode/ripgrep');
    rgPathCache = (m as { rgPath: string }).rgPath;
  } catch {
    rgPathCache = 'rg';
  }
  return rgPathCache;
}

interface Exec {
  code: number | string | null;
  stdout: string;
  stderr: string;
  killed: boolean;
  missing: boolean;
}

function run(bin: string, args: string[], cwd: string, timeout: number): Promise<Exec> {
  return new Promise((resolve) => {
    execFile(bin, args, { cwd, timeout, maxBuffer: MAX_BUFFER, encoding: 'utf8' }, (err, stdout, stderr) => {
      if (!err) return resolve({ code: 0, stdout, stderr, killed: false, missing: false });
      const e = err as NodeJS.ErrnoException & { killed?: boolean; code?: number | string };
      resolve({
        code: typeof e.code === 'number' ? e.code : (e.code ?? null),
        stdout: stdout ?? '',
        stderr: stderr ?? '',
        killed: !!e.killed,
        missing: e.code === 'ENOENT',
      });
    });
  });
}

/** Repo-relative path with forward slashes (ripgrep on Windows prints `.\\src\\a.js`). */
export function normaliseHitPath(p: string, platform: string = process.platform): string {
  const s = platform === 'win32' ? p.replace(/\\/g, '/') : p;
  return s.replace(/^\.\//, '');
}

function parseNull(stdout: string, max: number): { hits: Hit[]; truncated: boolean } {
  const hits: Hit[] = [];
  let truncated = false;
  for (const rec of stdout.split('\n')) {
    if (!rec) continue;
    const nul = rec.indexOf('\0');
    if (nul < 0) continue;
    const m = /^(\d+)[:-](.*)$/s.exec(rec.slice(nul + 1));
    if (!m) continue;
    if (hits.length >= max) {
      truncated = true;
      break;
    }
    hits.push({ file: normaliseHitPath(rec.slice(0, nul)), line: parseInt(m[1], 10), text: m[2] });
  }
  return { hits, truncated };
}

/**
 * Search the repo. The pattern is always passed as the value of `-e`, paths
 * come after `--`, and no shell is involved, so an agent-supplied pattern
 * such as `--pre=evil` can never become a flag. Never uses `rg -P`.
 */
export async function search(cwd: string, o: SearchOptions): Promise<SearchResult> {
  const max = o.maxHits ?? 200;
  const remaining = o.deadline - Date.now();
  if (remaining <= 0) return { hits: [], truncated: false, engine: 'none', timedOut: true, error: 'timeout' };
  const ignores = [...DEFAULT_IGNORES, ...o.ignore];
  const rg = await findRg();
  if (rg) {
    const args = [
      '--null',
      '--line-number',
      '--no-heading',
      '--with-filename',
      '--color',
      'never',
      '--hidden',
      '--no-require-git',
      '--max-filesize',
      '1M',
      '--max-columns',
      '400',
      '--max-count',
      '500',
    ];
    if (o.fixed) args.push('--fixed-strings');
    if (o.word) args.push('--word-regexp');
    if (o.includeIgnored) args.push('--no-ignore-vcs');
    for (const ig of ignores) args.push('--glob', '!' + ig.replace(/^\//, ''));
    args.push('-e', o.pattern, '--', '.');
    const r = await run(rg, args, cwd, remaining);
    if (!r.missing) {
      const { hits, truncated } = parseNull(r.stdout, max);
      if (r.killed && r.code !== 0 && hits.length === 0) {
        return { hits, truncated, engine: 'rg', timedOut: true, error: 'timeout' };
      }
      if (r.code === 2 && hits.length === 0 && r.stderr.trim()) {
        return { hits, truncated, engine: 'rg', error: r.stderr.trim().split('\n')[0] };
      }
      return { hits, truncated, engine: 'rg', timedOut: r.killed || undefined };
    }
  }
  // Fallback: git grep
  const args = ['grep', '-n', '-I', '-z', '--untracked', '--no-color'];
  if (o.includeIgnored) args.push('--no-exclude-standard');
  if (o.fixed) args.push('-F');
  else args.push('-E');
  if (o.word) args.push('-w');
  args.push('-e', o.pattern, '--', '.');
  for (const ig of ignores) args.push(`:(exclude,glob)${ig.replace(/^\//, '')}`, `:(exclude,glob)${ig.replace(/^\//, '')}/**`);
  const r = await run('git', args, cwd, Math.max(1, o.deadline - Date.now()));
  if (r.missing) return { hits: [], truncated: false, engine: 'none', error: 'no search engine (ripgrep and git unavailable)' };
  // git grep -z: `path\0line\0text\n`
  const hits: Hit[] = [];
  let truncated = false;
  for (const rec of r.stdout.split('\n')) {
    const parts = rec.split('\0');
    if (parts.length < 3) continue;
    if (hits.length >= max) {
      truncated = true;
      break;
    }
    hits.push({ file: normaliseHitPath(parts[0]), line: parseInt(parts[1], 10), text: parts.slice(2).join('\0') });
  }
  if (r.code === 128 || (r.code === 2 && !hits.length)) {
    return { hits, truncated, engine: 'git-grep', error: (r.stderr.trim().split('\n')[0] || 'git grep failed') };
  }
  return { hits, truncated, engine: 'git-grep', timedOut: r.killed || undefined };
}
