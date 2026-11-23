// Measures the two M1 performance targets. Usage: node scripts/perf.mjs [files=50000]
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const N = parseInt(process.argv[2] ?? '50000', 10);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'receipts-perf-'));
const t0 = Date.now();
for (let i = 0; i < N; i++) {
  const d = path.join(dir, 'src', `m${i % 500}`, `s${i % 37}`);
  if (i < 500 * 37) fs.mkdirSync(d, { recursive: true });
  let body = `export function fn${i}(a) {\n  // helper ${i}\n  return a + ${i};\n}\n`;
  if (i % 5000 === 0) body += 'console.log("debug");\n';
  if (i === 123) body += 'import { verifyToken } from "./auth";\nexport const x = verifyToken(1);\n';
  if (i === 7) body = 'export function verifyToken(t) { return !!t; }\n';
  fs.writeFileSync(path.join(d, `f${i}.js`), body);
}
fs.writeFileSync(path.join(dir, 'package.json'), '{"scripts":{"test":"jest"},"dependencies":{"bcrypt":"^5"}}');
const sh = (...a) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: dir, stdio: 'ignore' });
sh('init', '-q'); sh('add', '-A'); sh('commit', '-q', '-m', 'init');
console.log(`generated ${N} files + git commit in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

const msg = path.join(dir, '..', `msg-${process.pid}.txt`);
fs.writeFileSync(msg, `Done.
<receipts>
absent  | no console.log left | pattern: console\\.log
only    | verifyToken is only called from f123 | symbol: verifyToken | in: src/m123/s12/f123.js
code    | fn5 adds | src/m5/s5/f5.js:3 | quote: return a + 5
dep     | bcrypt is a dependency | name: bcrypt
run     | all tests pass | cmd: npm test
change  | renamed fn1 to fn2 | old: nothere | new: fn2
</receipts>`);
const ledger = path.join(dir, '.receipts', 'ledger.jsonl');
fs.mkdirSync(path.dirname(ledger), { recursive: true });

const hook = path.join(root, 'dist/cli/hook.js');
const payload = (command) => JSON.stringify({ session_id: 's', cwd: dir, hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command }, tool_response: { stdout: 'Tests:       3 passed, 3 total', stderr: '' } });
const time = (fn, n) => {
  const xs = [];
  for (let i = 0; i < n; i++) { const s = process.hrtime.bigint(); fn(); xs.push(Number(process.hrtime.bigint() - s) / 1e6); }
  xs.sort((a, b) => a - b);
  return { median: xs[Math.floor(xs.length / 2)], p95: xs[Math.floor(xs.length * 0.95)], max: xs[xs.length - 1] };
};
const fmt = (r) => `median ${r.median.toFixed(0)} ms, p95 ${r.p95.toFixed(0)} ms, max ${r.max.toFixed(0)} ms`;
console.log('node baseline (node -e 0):           ', fmt(time(() => spawnSync(process.execPath, ['-e', '0']), 30)));
console.log('ledger hook, non-test command (ls):  ', fmt(time(() => spawnSync(process.execPath, [hook, 'claude', 'ledger'], { input: payload('ls -la') }), 30)));
console.log('ledger hook, test cmd (+git snapshot):', fmt(time(() => spawnSync(process.execPath, [hook, 'claude', 'ledger'], { input: payload('npm test') }), 15)));

// a passing run on record so the `run` claim resolves
spawnSync(process.execPath, [hook, 'claude', 'ledger'], { input: payload('npm test') });
const main = path.join(root, 'dist/cli/main.js');
let last;
const check = time(() => { last = spawnSync(process.execPath, [main, 'check', '--message', msg, '--cwd', dir, '--session', 's', '--no-write', '--json'], { encoding: 'utf8' }); }, 7);
console.log(`check, 6 claims on ${N} files:       `, fmt(check));
const j = JSON.parse(last.stdout);
console.log(j.results.map((r) => `  ${r.label.padEnd(12)} ${r.claim.text.slice(0, 40)} :: ${r.summary.slice(0, 70)}`).join('\n'));
fs.rmSync(dir, { recursive: true, force: true });
fs.rmSync(msg, { force: true });
