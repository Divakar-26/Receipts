// Runs the REAL CLI on a small demo project and prints the captured output as JSON (used by make-gifs.py).
// Nothing here is mocked: init writes files, `receipts run` really runs the tests, the check reads the real ledger.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MAIN = path.join(root, 'dist/cli/main.js');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'receipts-usage-'));
const write = (f, c) => {
  fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
  fs.writeFileSync(path.join(dir, f), c);
};
write('package.json', JSON.stringify({ name: 'shop', scripts: { test: 'node --test' }, dependencies: { bcrypt: '^5.1.0' } }, null, 2) + '\n');
write('src/auth.js', "function verifyToken(t) {\n  if (!t) {\n    return null\n  }\n  return { ok: true }\n}\nmodule.exports = { verifyToken }\n");
write('src/login.js', "const { verifyToken } = require('./auth')\nmodule.exports = { login: (t) => verifyToken(t) }\n");
write('src/cart.js', "function total(items) {\n  console.log('debug', items)\n  return items.length\n}\nmodule.exports = { total }\n");
write('src/admin.js', "function audit(e) {\n  console.log('audit', e)\n}\nmodule.exports = { audit }\n");
write('test/login.test.js', "const test = require('node:test')\nconst assert = require('node:assert')\nconst { login } = require('../src/login')\ntest('login accepts a token', () => assert.ok(login('x')))\ntest('login rejects an empty token', () => assert.equal(login(''), null))\n");
write('test/cart.test.js', "const test = require('node:test')\nconst assert = require('node:assert')\nconst { total } = require('../src/cart')\ntest('total counts items', () => assert.equal(total([1, 2]), 2))\n");
const git = (...a) => execFileSync('git', ['-c', 'user.email=d@d', '-c', 'user.name=d', ...a], { cwd: dir, stdio: 'ignore' });
git('init', '-q');
git('add', '-A');
git('commit', '-q', '-m', 'shop');

const cli = (args, env = {}) => spawnSync(process.execPath, [MAIN, ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, ...env } });
const init = cli(['init', '--agent', 'claude']);
git('add', '-A');
git('commit', '-q', '-m', 'add receipts');
// the agent runs only the login tests (through `receipts run`, which records the real exit code)...
const ran = cli(['run', '--', 'npm', 'test', '--', 'test/login.test.js'], { RECEIPTS_SESSION: 'demo' });
// ...then edits a file after that run
fs.appendFileSync(path.join(dir, 'src/auth.js'), '// tidy up\n');
const reply = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'receipts-reply-')), 'reply.md');
fs.writeFileSync(
  reply,
  `Done. Tokens are validated and I cleaned up the logging.

<receipts>
dep    | bcrypt is a dependency           | name: bcrypt
code   | an empty token returns null      | src/auth.js:3 | quote: return null
absent | removed all console.logs         | pattern: console\\.log
run    | all tests pass                   | cmd: npm test -- test/login.test.js
judge  | this won't affect other callers of \`verifyToken\`
</receipts>
`,
);
const check = cli(['check', '--message', reply, '--session', 'demo', '--no-write'], { FORCE_COLOR: '1' });
const block = cli(['check', '--message', reply, '--session', 'demo', '--no-write', '--mode', 'block']);
process.stdout.write(
  JSON.stringify({ init: init.stdout, runExit: ran.status, check: check.stdout, checkExit: check.status, blockExit: block.status, blockReason: block.stderr }, null, 2),
);
fs.rmSync(dir, { recursive: true, force: true });
