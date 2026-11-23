// Runs the test suite on every supported Node version (20+). Node 20 cannot expand globs in `node --test` and has
// no coverage thresholds, so the file list is built here and coverage flags are added only where Node supports them.
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const walk = (dir, re, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, re, out);
    else if (re.test(e.name)) out.push(path.relative(root, p));
  }
  return out;
};
const files = [...walk(path.join(root, 'dist'), /\.test\.js$/), ...walk(path.join(root, 'bench'), /^[^/]*\.test\.mjs$/).filter((f) => path.dirname(f) === 'bench')].sort();
const [major, minor] = process.versions.node.split('.').map(Number);
const args = ['--test'];
if (major > 22 || (major === 22 && minor >= 8)) {
  args.push('--experimental-test-coverage', '--test-coverage-lines=90', '--test-coverage-include=dist/core/**', '--test-coverage-exclude=dist/core/testutil.js', '--test-coverage-exclude=dist/**/*.test.js');
}
const r = spawnSync(process.execPath, [...args, ...files], { cwd: root, stdio: 'inherit' });
process.exit(r.status ?? 1);
