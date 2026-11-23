import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { check, CheckOutput } from './check.js';
import { buildShellEntry } from './ledger-hook.js';
import { DEFAULT_CONFIG, LedgerEntry } from './types.js';

export function mkdir(): string {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'receipts-test-')));
}

export function write(dir: string, files: Record<string, string>): void {
  for (const [f, c] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), c);
  }
}

export function git(dir: string, ...args: string[]): void {
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', ...args], { cwd: dir, stdio: 'ignore' });
}

export function mkRepo(files: Record<string, string>, opts: { git?: boolean } = {}): string {
  const dir = mkdir();
  write(dir, files);
  if (opts.git !== false) {
    git(dir, 'init', '-q');
    git(dir, 'add', '-A');
    git(dir, 'commit', '-q', '-m', 'init');
  }
  return dir;
}

export const SESSION = 's1';

export function shellEntry(dir: string, cmd: string, o: { exit?: number | null; out?: string } = {}): Promise<LedgerEntry> {
  return buildShellEntry({ session: SESSION, agent: 'test', cmd, exit: o.exit === undefined ? 0 : o.exit, output: o.out ?? '', cwd: dir });
}

export const JEST_OK = 'Tests:       42 passed, 42 total\n';
export const JEST_FAIL = 'Tests:       2 failed, 40 passed, 42 total\n';

export function run(dir: string, message: string, ledger: LedgerEntry[] = [], o: Partial<Parameters<typeof check>[0]> = {}): Promise<CheckOutput> {
  return check({ message, ledger, cwd: dir, session: SESSION, config: { ...DEFAULT_CONFIG, mode: 'block' }, ...o });
}

export const block = (...lines: string[]) => `Done.\n\n<receipts>\n${lines.join('\n')}\n</receipts>`;
