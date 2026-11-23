// Builds a small demo repo with a real command ledger, runs a real check, and prints the colored report.
// Used to render docs/report.png (scripts/render-media.py). No model is involved.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const core = await import(pathToFileURL(path.join(root, 'dist/core/index.js')).href);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'receipts-demo-'));
const write = (f, c) => {
  fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
  fs.writeFileSync(path.join(dir, f), c);
};
write('package.json', JSON.stringify({ name: 'shop', scripts: { test: 'jest' }, dependencies: { bcrypt: '^5.1.0' } }, null, 2));
write('src/auth.js', "const bcrypt = require('bcrypt')\n\nfunction verifyToken(t) {\n  if (expired(t)) {\n    return null\n  }\n  return decode(t)\n}\nmodule.exports = { verifyToken }\n");
write('src/login.js', "const { verifyToken } = require('./auth')\nmodule.exports = (t) => verifyToken(t)\n");
write('src/cart.js', "function total(items) {\n  console.log('debug', items)\n  return items.length\n}\n");
write('src/admin.js', "function audit(e) {\n  console.log('audit', e)\n}\n");
const git = (...a) => execFileSync('git', ['-c', 'user.email=d@d', '-c', 'user.name=d', ...a], { cwd: dir, stdio: 'ignore' });
git('init', '-q');
git('add', '-A');
git('commit', '-q', '-m', 'demo');

const S = 'demo';
const entry = (cmd, out, exit = 0) => core.buildShellEntry({ session: S, agent: 'demo', cmd, exit, output: out, cwd: dir });
const ledger = [await entry('npm test -- login', 'Tests:       6 passed, 6 total\n')];
const loginRun = await entry('npx jest login.test.js', 'Tests:       6 passed, 6 total\n');
ledger.push(loginRun);
write('src/auth.js', fs.readFileSync(path.join(dir, 'src/auth.js'), 'utf8') + '// refactor\n'); // edited after the run

const message = `Done.
<receipts>
dep    | bcrypt is a dependency                 | name: bcrypt
code   | expired token returns null             | src/auth.js:5 | quote: return null
absent | removed all console.logs               | pattern: console\\.log
run    | all tests pass                         | cmd: npm test -- login
judge  | this won't affect other callers of \`verifyToken\`
run    | login tests pass                       | cmd: npx jest login.test.js
</receipts>`;
const out = await core.check({ message, ledger, cwd: dir, session: S });
process.stdout.write(core.formatReport(out.report, true) + '\n');
fs.rmSync(dir, { recursive: true, force: true });
