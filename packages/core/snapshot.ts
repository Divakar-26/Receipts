import { execFile } from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

function git(cwd: string, args: string[], timeout = 8000): Promise<Buffer | null> {
  return new Promise((resolve) => {
    execFile('git', args, { cwd, timeout, maxBuffer: 256 * 1024 * 1024, encoding: 'buffer' }, (err, stdout) => {
      resolve(err ? null : (stdout as Buffer));
    });
  });
}

export const SNAP_EXCLUDE = new Set(['.git', '.receipts', 'node_modules']);

/**
 * sha256(HEAD sha + `git diff HEAD --binary` + path/size/mtime of untracked,
 * non-ignored files). Returns null when it cannot be computed ("not checked").
 * Without git, falls back to the newest mtime and file count under `cwd`.
 */
export async function takeSnapshot(cwd: string): Promise<string | null> {
  const inside = await git(cwd, ['rev-parse', '--is-inside-work-tree']);
  if (inside && inside.toString().trim() === 'true') return gitSnapshot(cwd);
  return mtimeSnapshot(cwd);
}

async function gitSnapshot(cwd: string): Promise<string | null> {
  const [head, diffHead, untracked] = await Promise.all([
    git(cwd, ['rev-parse', '--verify', '-q', 'HEAD']),
    git(cwd, ['diff', 'HEAD', '--binary', '--no-color', '--', '.', ':(exclude).receipts']),
    git(cwd, ['ls-files', '-o', '--exclude-standard', '-z', '--', '.', ':(exclude).receipts']),
  ]);
  // With no commits yet `diff HEAD` fails; fall back to the plain diff.
  const diff = diffHead ?? (head ? null : await git(cwd, ['diff', '--binary', '--no-color', '--', '.', ':(exclude).receipts']));
  if (!untracked) return null;
  const h = crypto.createHash('sha256');
  h.update('head:' + (head ? head.toString().trim() : 'none') + '\n');
  h.update(diff ?? Buffer.alloc(0));
  const files = untracked.toString().split('\0').filter(Boolean).sort();
  for (const f of files) {
    try {
      const st = fs.statSync(path.join(cwd, f));
      h.update(`\nu:${f}:${st.size}:${Math.floor(st.mtimeMs)}`);
    } catch {
      h.update(`\nu:${f}:gone`);
    }
  }
  return 'git:' + h.digest('hex');
}

function mtimeSnapshot(cwd: string, maxFiles = 20000, budgetMs = 1500): string | null {
  const start = Date.now();
  let count = 0;
  let newest = 0;
  const stack = [cwd];
  while (stack.length) {
    const dir = stack.pop()!;
    let ents: fs.Dirent[];
    try {
      ents = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of ents) {
      if (SNAP_EXCLUDE.has(e.name)) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.isFile()) {
        if (++count > maxFiles || Date.now() - start > budgetMs) return null;
        try {
          newest = Math.max(newest, Math.floor(fs.statSync(p).mtimeMs));
        } catch {
          /* ignore */
        }
      }
    }
  }
  return `mtime:${count}:${newest}`;
}
