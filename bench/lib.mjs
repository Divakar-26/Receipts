// Shared helpers for the benchmark: load tasks, build workspaces, apply reference solutions, run checks.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const BENCH = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.join(BENCH, '..');
export const TASKS_DIR = path.join(BENCH, 'tasks');
export const REPOS_DIR = path.join(BENCH, 'repos');

export function loadTasks({ split } = {}) {
  const out = [];
  for (const id of fs.readdirSync(TASKS_DIR).sort()) {
    const dir = path.join(TASKS_DIR, id);
    if (!fs.existsSync(path.join(dir, 'task.json'))) continue;
    const t = JSON.parse(fs.readFileSync(path.join(dir, 'task.json'), 'utf8'));
    t.dir = dir;
    if (!split || t.split === split) out.push(t);
  }
  return out;
}

export function copyTree(src, dst) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dst, { recursive: true });
  fs.cpSync(src, dst, { recursive: true });
}

const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'ignore' });

/** Base repo + overlay (the planted trap), committed to git. */
export function buildWorkspace(task, dir) {
  fs.mkdirSync(dir, { recursive: true });
  copyTree(path.join(REPOS_DIR, task.repo), dir);
  copyTree(path.join(task.dir, 'overlay'), dir);
  run('git', ['init', '-q'], dir);
  run('git', ['add', '-A'], dir);
  run('git', ['-c', 'user.email=b@b', '-c', 'user.name=bench', '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'task start'], dir);
  return dir;
}

function listFiles(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', '.receipts', '.claude'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listFiles(p, out);
    else out.push(p);
  }
  return out;
}

/** Apply a change spec (the reference `solution` or the `naive` partial change). */
export function applyChange(task, dir, kind = 'solution') {
  const s = task[kind] ?? {};
  const scope = s.scope?.map((p) => path.join(dir, p));
  const inScope = (f) => !scope || scope.some((p) => f === p || f.startsWith(p + path.sep));
  for (const [from, to] of s.rename ?? []) {
    for (const f of listFiles(dir)) {
      if (!inScope(f)) continue;
      let text;
      try { text = fs.readFileSync(f, 'utf8'); } catch { continue; }
      if (text.includes(from)) fs.writeFileSync(f, text.split(from).join(to));
    }
  }
  for (const [rel, from, to] of s.replace ?? []) {
    const f = path.join(dir, rel);
    const text = fs.readFileSync(f, 'utf8');
    if (!text.includes(from)) throw new Error(`${kind} replace: "${from}" not found in ${rel}`);
    fs.writeFileSync(f, text.split(from).join(to));
  }
  copyTree(path.join(task.dir, kind), dir);
  for (const rel of s.remove ?? []) fs.rmSync(path.join(dir, rel), { force: true });
}
export const applySolution = (task, dir) => applyChange(task, dir, 'solution');

/** Run a shell command; exit 0 = true. */
export function sh(cmd, cwd, timeoutMs = 120_000) {
  const r = spawnSync('bash', ['-c', cmd], { cwd, encoding: 'utf8', timeout: timeoutMs });
  return { code: r.status ?? (r.signal ? 124 : 1), out: ((r.stdout ?? '') + (r.stderr ?? '')).slice(-2000) };
}

/** Copy the hidden tests in and run the hidden command. */
export function runHidden(task, dir) {
  copyTree(path.join(task.dir, 'hidden'), dir);
  return sh(task.hidden.cmd, dir);
}

export function tmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
export { fs, path };
