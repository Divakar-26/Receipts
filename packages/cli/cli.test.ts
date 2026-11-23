import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkRepo, mkdir, write } from '../core/testutil.js';
import { readLedger, ledgerPath } from '../core/ledger.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const MAIN = path.join(here, 'main.js');
const HOOK = path.join(here, 'hook.js');
const FIX = path.join(here, '..', '..', 'test', 'fixtures', 'claude-code');
const node = (args: string[], o: { cwd?: string; input?: string; env?: NodeJS.ProcessEnv } = {}) =>
  spawnSync(process.execPath, args, { cwd: o.cwd, input: o.input, encoding: 'utf8', env: { ...process.env, ...o.env } });

test('check: report, exit codes, --json, last-report.md, state-based retry cap', () => {
  const dir = mkRepo({ '.receipts.json': '{"mode":"block"}', 'src/cart.js': 'console.log(1);\n' });
  const msg = path.join(dir, 'msg.txt');
  fs.writeFileSync(msg, 'Done.\n<receipts>\nabsent | removed all console.log | pattern: console\\.log\n</receipts>\n');
  fs.mkdirSync(path.join(dir, '.receipts'));
  fs.writeFileSync(path.join(dir, '.receipts', 'state.json'), JSON.stringify({ currentSession: 'sx', sessions: { sx: { blocks: 0 } } }));
  const first = node([MAIN, 'check', '--message', msg, '--cwd', dir]);
  assert.equal(first.status, 2);
  assert.match(first.stdout, /🧾 Receipts — 1 claim · 1 contradicted/);
  assert.match(first.stdout, /src\/cart\.js:1/);
  assert.match(first.stderr, /Format reminder/);
  assert.match(fs.readFileSync(path.join(dir, '.receipts', 'last-report.md'), 'utf8'), /contradicted/);
  const second = node([MAIN, 'check', '--message', msg, '--cwd', dir]);
  assert.equal(second.status, 0, 'second failed check in the same turn does not block');
  assert.match(second.stdout, /not blocking again/);
  const rep = node([MAIN, 'report', '--cwd', dir]);
  assert.equal(rep.status, 0);
  assert.match(rep.stdout, /not blocking again/);
  const json = node([MAIN, 'check', '--message', msg, '--cwd', dir, '--json', '--no-write', '--mode', 'warn']);
  const j = JSON.parse(json.stdout);
  assert.equal(j.results[0].label, 'CONTRADICTED');
  assert.equal(j.decision.block, false);
  const stdin = node([MAIN, 'check', '--message', '-', '--cwd', dir, '--no-write', '--mode', 'warn'], { input: 'hello there' });
  assert.equal(stdin.status, 0);
  assert.match(stdin.stdout, /no claims/);
});

test('check/usage/errors', () => {
  assert.equal(node([MAIN]).status, 0);
  assert.match(node([MAIN, '--help']).stdout, /receipts check/);
  assert.equal(node([MAIN, 'nope']).status, 64);
  assert.equal(node([MAIN, 'check']).status, 64);
  assert.equal(node([MAIN, 'run']).status, 64);
  const empty = mkdir();
  assert.equal(node([MAIN, 'report', '--cwd', empty]).status, 1);
  const missing = node([MAIN, 'check', '--message', '/nonexistent/file']);
  assert.equal(missing.status, 1);
});

test('run: logs the real exit code, passes output through, redacts', () => {
  const dir = mkRepo({ 'package.json': '{"scripts":{"test":"x"}}' });
  const ok = node([MAIN, 'run', '--', process.execPath, '-e', 'console.log("Tests:       3 passed, 3 total"); console.error("token=abc123")'], { cwd: dir, env: { RECEIPTS_SESSION: 'sess' } });
  assert.equal(ok.status, 0);
  assert.match(ok.stdout, /3 passed/);
  const bad = node([MAIN, 'run', '--', process.execPath, '-e', 'process.exit(3)'], { cwd: dir, env: { RECEIPTS_SESSION: 'sess' } });
  assert.equal(bad.status, 3);
  const shell = node([MAIN, 'run', 'echo hi | tail -1'], { cwd: dir, env: { RECEIPTS_SESSION: 'sess' } });
  assert.match(shell.stdout, /hi/);
  // one argument goes through the platform shell: bash says 127, cmd.exe says 1 ("is not recognized")
  const nope = node([MAIN, 'run', '--', 'definitely-not-a-command-xyz'], { cwd: dir, env: { RECEIPTS_SESSION: 'sess' } });
  assert.equal(nope.status, process.platform === 'win32' ? 1 : 127);
  // several arguments are exec'd directly: a missing program is 127 everywhere
  const direct = node([MAIN, 'run', '--', 'definitely-not-a-command-xyz', '--flag'], { cwd: dir, env: { RECEIPTS_SESSION: 'sess' } });
  assert.equal(direct.status, 127);
  const entries = readLedger(ledgerPath(dir));
  assert.equal(entries.length, 5);
  const [e0, e1, e2] = entries;
  assert.ok(e0.kind === 'shell' && e0.exit === 0 && e0.exit_trusted && e0.summary?.passed === 3 && !(e0.out_tail ?? '').includes('abc123'));
  assert.ok(e1.kind === 'shell' && e1.exit === 3 && e1.exit_trusted);
  assert.ok(e2.kind === 'shell' && e2.exit === 0 && !e2.exit_trusted, 'a piped single-string command is not trusted');
  assert.equal(e0.session, 'sess');
});

test('claude ledger hook: real payloads append to the ledger; garbage never breaks the agent', () => {
  const dir = mkdir();
  for (const f of ['PostToolUse.Bash.json', 'PostToolUseFailure.Bash.json']) {
    const payload = JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf8'));
    payload.cwd = dir;
    const r = node([HOOK, 'claude', 'ledger'], { input: JSON.stringify(payload) });
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
  }
  const entries = readLedger(ledgerPath(dir));
  assert.deepEqual(entries.map((e) => e.kind === 'shell' && e.exit), [0, 2]);
  write(dir, { '.receipts.json': '{"testCommand":"make check"}' });
  assert.equal(node([HOOK, 'claude', 'ledger'], { input: 'not json' }).status, 0);
  assert.equal(node([HOOK, 'claude', 'ledger'], { input: '{}' }).status, 0);
  assert.equal(readLedger(ledgerPath(dir)).length, 2);
});

test('ledger hook: test commands get their snapshot from a detached worker (hook stays fast)', async () => {
  const dir = mkRepo({ 'package.json': '{"scripts":{"test":"jest"}}', 'a.js': 'x\n' });
  const payload = { session_id: 's', cwd: dir, hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'npm test' }, tool_response: { stdout: 'Tests:       3 passed, 3 total', stderr: '' } };
  const r = node([HOOK, 'claude', 'ledger'], { input: JSON.stringify(payload), env: { RECEIPTS_SNAPSHOT: '' } });
  assert.equal(r.status, 0);
  const deadline = Date.now() + 10_000;
  let e = readLedger(ledgerPath(dir))[0];
  while (e?.kind === 'shell' && !e.snap && Date.now() < deadline) {
    await new Promise((res) => setTimeout(res, 50));
    e = readLedger(ledgerPath(dir))[0];
  }
  assert.ok(e && e.kind === 'shell' && typeof e.snap === 'string' && e.snap.startsWith('git:'), 'worker appended the snapshot');
  assert.equal((e as { snap_id?: string }).snap_id, undefined, 'merged on read');
  const raw = fs.readFileSync(ledgerPath(dir), 'utf8');
  assert.match(raw, /"kind":"snap"/);
  // inline mode (tests, `receipts run`) still works
  const dir2 = mkRepo({ 'a.js': 'x\n' });
  node([HOOK, 'claude', 'ledger'], { input: JSON.stringify({ ...payload, cwd: dir2 }), env: { RECEIPTS_SNAPSHOT: 'inline' } });
  const e2 = readLedger(ledgerPath(dir2))[0];
  assert.ok(e2.kind === 'shell' && typeof e2.snap === 'string');
});
