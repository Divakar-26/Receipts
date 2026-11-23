import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runnerKey, analyseCommand, detectFilter, exitTrusted, isBuildCmd, isTestCmd, isTestOrBuild, normaliseSegment, splitShell, unwrapReceiptsRun, words } from './cmd.js';
import { parseSummary, PARSERS } from './runners/index.js';
import { parseLine, parseLoc, parseMessage, splitFields } from './claims.js';
import { buildMatchers, hasUniversal, identifiers, isTestPass } from './lexicon.js';
import { scanProse, sentences, typeGaming } from './scanner.js';
import { appendEntry, parseLedger, pruneLedger, readLedger, redact, sessionEntries, tailLines } from './ledger.js';
import { detectCommands, loadConfig, normaliseConfig } from './config.js';
import { loadState, resetTurn, saveState } from './state.js';
import { blockMessage, decide, reasonFor } from './policy.js';
import { counts, formatReport } from './report.js';
import { classifyHits, heuristicKind, isCodeFile, languageFor, occurrences } from './syntax.js';
import { findDependency, verifyDep } from './verifiers/dep.js';
import { isDefinition, isExportLine } from './verifiers/only.js';
import { search } from './search.js';
import { entryFromClaude } from './ledger-hook.js';
import { takeSnapshot } from './snapshot.js';
import { block, mkRepo, mkdir, run, write, shellEntry, JEST_OK } from './testutil.js';
import { DEFAULT_CONFIG } from './types.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(here, '..', '..', 'test', 'fixtures');

test('splitShell / words / normalise / unwrap', () => {
  assert.deepEqual(splitShell('a && b | c; d &').map((s) => [s.text, s.op]), [['a', '&&'], ['b', '|'], ['c', ';'], ['d', '&']]);
  assert.deepEqual(splitShell(`grep -E "a|b" f 2>&1 || true`).map((s) => s.text), ['grep -E "a|b" f 2>&1', 'true']);
  assert.deepEqual(splitShell('a\nb').map((s) => s.text), ['a', 'b']);
  assert.deepEqual(splitShell('echo \\| x |& tee f').map((s) => s.op), ['|', '']);
  assert.deepEqual(words(`pytest -k "a b" 'c d' e\\ f ""`), ['pytest', '-k', 'a b', 'c d', 'e f', '']);
  assert.equal(normaliseSegment('  CI=1  npm   run test 2>&1 '), 'npm test');
  assert.equal(normaliseSegment('npm t'), 'npm test');
  assert.equal(normaliseSegment('x >/dev/null'), 'x');
  assert.equal(unwrapReceiptsRun('receipts run -- npm test'), 'npm test');
  assert.equal(unwrapReceiptsRun('npx @divakar-26/receipts run npm test'), 'npm test');
  assert.equal(unwrapReceiptsRun('npx -y @divakar-26/receipts run -- npm test'), 'npm test');
  assert.equal(unwrapReceiptsRun('npm test'), 'npm test');
});

test('masking: pipes, ||, ;, &, set +e', () => {
  const m = (c: string) => analyseCommand(c).map((s) => s.masked);
  assert.deepEqual(m('npm test | tail -20'), [true, false]);
  assert.deepEqual(m('npm test | grep ok'), [true, false]);
  assert.deepEqual(m('npm test || true'), [true, false]);
  assert.deepEqual(m('npm test; echo done'), [true, false]);
  assert.deepEqual(m('npm test &'), [true]);
  assert.deepEqual(m('set +e; npm test'), [true, true]);
  assert.deepEqual(m('cd app && npm test'), [false, false]);
  assert.deepEqual(m('cd app; npm test'), [true, false]);
  assert.deepEqual(m('set -o pipefail; npm test | tail').slice(1, 2), [false]);
  assert.equal(analyseCommand('npm test;')[0].masked, false);
  assert.equal(analyseCommand('npm test | tail')[0].maskReason, 'piped');
  assert.equal(exitTrusted('npm test | tail -20'), false);
  assert.equal(exitTrusted('cd x; npm test'), true);
  assert.equal(exitTrusted('npm test && echo hi'), true);
  assert.equal(exitTrusted(''), false);
});

test('test/build command recognition', () => {
  for (const c of ['npm test', 'npm run test', 'yarn test', 'pnpm test -- x', 'npx jest', 'vitest run', 'mocha', 'pytest -q', 'python -m pytest', 'python3 -m unittest', 'go test ./...', 'cargo test', 'mvn test', './mvnw verify', './gradlew test', 'rspec', 'bundle exec rspec', 'vendor/bin/phpunit', 'node --test', 'make test']) {
    assert.ok(isTestCmd(normaliseSegment(c)), c);
  }
  for (const c of ['npm run build', 'tsc', 'npx tsc -p .', 'go build ./...', 'cargo build', 'mvn package', 'make', 'next build']) assert.ok(isBuildCmd(c), c);
  assert.ok(!isTestCmd('ls -la') && !isBuildCmd('echo hi'));
  assert.ok(isTestOrBuild('my-ci-script', { testCommand: 'my-ci-script' }));
  assert.ok(isTestOrBuild('foo && my-build', { buildCommand: 'my-build' }));
  assert.ok(!isTestOrBuild('ls'));
});

test('filter detection', () => {
  const f = (c: string) => detectFilter(normaliseSegment(c));
  assert.match(f('npm test -- login')!, /login/);
  assert.match(f('npm test -- -t "login"')!, /-t/);
  assert.match(f('npx jest --testNamePattern=login')!, /testNamePattern/);
  assert.match(f('npx jest src/a.test.js')!, /a\.test\.js/);
  assert.match(f('pytest tests/test_a.py')!, /test_a\.py/);
  assert.match(f('pytest tests/test_a.py::test_x')!, /::/);
  assert.match(f('pytest -k login')!, /-k/);
  assert.match(f('python -m pytest -m slow')!, /-m/);
  assert.match(f('go test ./pkg/auth')!, /pkg\/auth/);
  assert.match(f('go test -run TestX ./...')!, /-run/);
  assert.match(f('cargo test login')!, /login/);
  assert.match(f('mvn test -Dtest=LoginTest')!, /Dtest/);
  assert.match(f('node --test test/a.test.js')!, /a\.test\.js/);
  assert.match(f('npx mocha --grep login')!, /grep/);
  assert.equal(f('npm test'), null);
  assert.equal(f('npm test -- --coverage'), null);
  assert.equal(f('npm test -- --reporter dot'), null);
  assert.equal(f('go test ./...'), null);
  assert.equal(f('go test'), null);
  assert.equal(f('cargo test --workspace'), null);
  assert.equal(f('pytest tests/'), null);
  assert.equal(f('mvn test'), null);
  assert.equal(f('bundle exec rspec'), null);
  assert.equal(f(''), null);
  assert.equal(f('yarn run test'), null);
});

test('runnerKey ignores wrappers and flags', () => {
  const k = (c: string) => runnerKey(normaliseSegment(c));
  assert.equal(k('python3 -m pytest -q tests'), 'pytest');
  assert.equal(k('pytest'), 'pytest');
  assert.equal(k('npx jest --coverage'), 'jest');
  assert.equal(k('npm run test -- --reporter dot'), 'npm test');
  assert.equal(k('go test ./...'), 'go test');
  assert.equal(k('./gradlew test'), 'gradlew');
  assert.equal(k('bundle exec rspec'), 'rspec');
  assert.equal(k('make check'), 'make check');
  assert.equal(k(''), '');
});

test('runner summaries: one fixture per runner', () => {
  const read = (n: string) => fs.readFileSync(path.join(FIX, 'runners', n), 'utf8');
  const expect: Record<string, [string, number, number, number]> = {
    'jest.txt': ['jest', 41, 1, 1],
    'vitest.txt': ['vitest', 42, 0, 1],
    'mocha.txt': ['mocha', 42, 1, 3],
    'nodetest.txt': ['node:test', 4, 1, 0],
    'pytest.txt': ['pytest', 41, 1, 1],
    'unittest.txt': ['unittest', 39, 3, 0],
    'cargo.txt': ['cargo test', 12, 0, 1],
    'surefire.txt': ['surefire', 9, 1, 2],
    'gradle.txt': ['gradle', 39, 1, 2],
    'rspec.txt': ['rspec', 39, 2, 1],
    'phpunit.txt': ['phpunit', 42, 0, 0],
    'phpunit-fail.txt': ['phpunit', 39, 1, 2],
  };
  for (const [file, [runner, passed, failed, skipped]] of Object.entries(expect)) {
    const s = parseSummary(read(file));
    assert.ok(s, file);
    assert.deepEqual([s!.runner, s!.passed, s!.failed, s!.skipped], [runner, passed, failed, skipped], file);
  }
  assert.equal(parseSummary(read('cargo.txt'))!.filtered, 3);
  const go = parseSummary(read('gotest.txt'))!;
  assert.deepEqual([go.runner, go.passed, go.failed, go.unit], ['go test', 1, 1, 'packages']);
  const gov = parseSummary('--- PASS: TestA (0.00s)\n--- FAIL: TestB (0.00s)\n--- SKIP: TestC (0.00s)\nFAIL\texample/x\t0.01s\n')!;
  assert.deepEqual([gov.passed, gov.failed, gov.skipped, gov.unit], [1, 1, 1, 'tests']);
  assert.equal(parseSummary(read('pytest-empty.txt'))!.passed, 0);
  // node:test reports a file with no tests as one passing test; those file-level passes are not tests
  assert.equal(parseSummary(read('nodetest-empty.txt'))!.passed, 0);
  assert.equal(parseSummary(read('nodetest-empty-tap.txt'))!.passed, 0);
  const mixed = '✔ test/noop.test.js (29ms)\n✔ real one (0.4ms)\n▶ suite\n  ✔ inner (0.4ms)\n✔ suite (1ms)\nℹ tests 3\nℹ pass 3\nℹ fail 0\n';
  assert.equal(parseSummary(mixed)!.passed, 2);
  assert.equal(parseSummary('No tests found, exiting with code 1')!.passed, 0);
  assert.equal(parseSummary(' No test files found')!.runner, 'vitest');
  assert.equal(parseSummary('=== no tests ran in 0.01s ===')!.runner, 'pytest');
  assert.equal(parseSummary('ok  \texample/x\t0.1s [no tests to run]\n')!.passed, 0);
  assert.equal(parseSummary('No tests executed!')!.runner, 'phpunit');
  assert.equal(parseSummary('Ran 3 tests in 0.1s\n\nOK (skipped=1)')!.skipped, 1);
  assert.equal(parseSummary('Ran 3 tests in 0.1s\n'), null);
  assert.equal(parseSummary('\u001b[32mTests:\u001b[0m       3 passed, 3 total')!.passed, 3);
  assert.equal(parseSummary('just some output'), null);
  assert.equal(parseSummary('0 examples, 0 failures')!.passed, 0);
  assert.equal(Object.keys(PARSERS).length, 11);
  for (const p of Object.values(PARSERS)) assert.equal(p('nothing relevant here'), null);
});

test('claim grammar: escapes, types, required fields, last block only', () => {
  assert.deepEqual(splitFields('a \\| b | c'), ['a | b', 'c']);
  assert.equal(parseLine('absent | no foo | pattern: a\\|b', 1).fields.pattern, 'a|b');
  const c = parseLine('code | x | src/a.js:57 | quote: return null', 1);
  assert.deepEqual([c.type, c.loc, c.fields.quote], ['code', 'src/a.js:57', 'return null']);
  assert.deepEqual(parseLoc('a/b.js:5-9'), { file: 'a/b.js', start: 5, end: 9 });
  assert.equal(parseLoc('nope'), null);
  for (const bad of ['', 'nonsense | x', 'code | x | src/a.js:5', 'code | x | quote: y', 'run | x', 'only | x | symbol: y', 'change | x | old: a', 'dep | x', 'run |', 'absent | x | pattern:']) {
    assert.equal(parseLine(bad, 1).type, 'untagged', bad);
  }
  assert.equal(parseLine('judge | just a judgement', 1).type, 'judge');
  assert.equal(parseLine('DEP | bcrypt | name: bcrypt', 1).type, 'dep');
  const msg = 'text\n<receipts>\nrun | old | cmd: a\n</receipts>\nmore\n<receipts>\nrun | new | cmd: b\n\ngarbage line\n</receipts>';
  const p = parseMessage(msg);
  assert.deepEqual(p.claims.map((x) => x.fields.cmd), ['b']);
  assert.equal(p.untagged.length, 1);
  assert.ok(!p.outside.includes('<receipts>'));
  const open = parseMessage('hi\n<receipts>\nrun | x | cmd: ls');
  assert.equal(open.claims.length, 1);
  assert.equal(parseMessage('no block here').hasBlock, false);
});

test('lexicon, identifiers, sentences, scanner', () => {
  const m = buildMatchers(['totally'], ['bulletproof']);
  assert.ok(hasUniversal(m, 'sirf login use karta hai'));
  assert.ok(hasUniversal(m, 'totally done'));
  assert.ok(!hasUniversal(m, 'nothing special'));
  assert.ok(!hasUniversal(m, 'reallyall'));
  for (const s of ['All tests pass', 'the build succeeds', '42 tests passed', 'sab pass ho gaye', 'all 12 tests are green']) assert.ok(isTestPass(m, s), s);
  assert.ok(!isTestPass(m, 'the tests are slow'));
  const ids = identifiers('`verifyToken` in src/auth/login.js and getUser_name, parseJSONThing, console.log, config.yml');
  for (const want of ['verifyToken', 'src/auth/login.js', 'getUser_name', 'console.log', 'config.yml']) assert.ok(ids.includes(want), want);
  assert.deepEqual(identifiers('plain words only, e.g. this'), []);
  assert.deepEqual(identifiers('see `src/login.js:3` and `src/login.js:3-9` and a.js#L4'), ['src/login.js', 'a.js']);
  // a prose sentence citing file:line is covered by a tagged claim that names the file
  const cited = scanProse('The only real call is in `src/login.js:3`.', [{ type: 'only', text: 'verifyToken only from login', fields: { symbol: 'verifyToken', in: 'src/login.js' }, line: 1 }], buildMatchers());
  assert.equal(cited.flagged.length, 0);

  const text = 'I fixed it.\n```\nall tests pass\n```\n> all tests pass quoted\nHe said "all tests pass". Should I run all tests?\nNext, I will fix everything in `a.js`.\n- Tests are green.\n1. `verifyToken` is never null.';
  const ss = sentences(text);
  assert.deepEqual(ss.filter((s) => !s.startsWith('He said')), ['I fixed it.', 'Tests are green.', '`verifyToken` is never null.']);

  const scan = scanProse(text, [], m);
  assert.deepEqual(scan.flagged.map((f) => f.kind).sort(), ['testpass', 'universal']);
  const warn = scanProse('Everything is fine now. This is safe. I fixed the bug.', [], m);
  assert.equal(warn.flagged.length, 0);
  assert.deepEqual(warn.warnings.map((w) => w.category), ['judgment', 'done']);
  const restated = scanProse('All tests pass.', [{ type: 'judge', text: 'All tests pass', fields: {}, line: 1 }], m);
  assert.equal(restated.flagged.length, 0);
  const runTagged = scanProse('The suite is green and all tests pass.', [{ type: 'run', text: 'x', fields: { cmd: 'npm test' }, line: 1 }], m);
  assert.equal(runTagged.flagged.length, 0);
  const partial = scanProse('`a` and `b` are only used here.', [{ type: 'only', text: '`a` only used', fields: { symbol: 'a', in: 'x' }, line: 1 }], m);
  assert.equal(partial.flagged.length, 1);
});

test('scanner: sentences from real Claude sessions are not false positives (and real claims still are)', () => {
  const m = buildMatchers();
  const onlySym = [{ type: 'only' as const, text: 'verifyToken is only called from login', fields: { symbol: 'verifyToken', in: 'src/login.js' }, line: 1 }];
  const flagged = (text: string, tagged = onlySym) => scanProse(text, tagged, m).flagged.length;
  // hedges, negations and the agent narrowing its own scope (seen in e2e transcripts)
  for (const ok of [
    'I ran `npm test | tail -20`, and the tests did not all pass.',
    'Because of the `tail`, I only saw the last 20 lines.',
    'The claim is true for `src/cart.js` only.',
    'The receipts claim covers the whole repo, but I only checked `src/cart.js`.',
    'I added a `code` receipt for that line and kept the `only` line you specified.',
    '`verifyToken` is also called from `lib/admin/panel.js`, so `src/login.js` is not the only caller.',
    '**Real call:** `src/login.js:3` is the only place that calls it (`return verifyToken(t)`).',
  ]) assert.equal(flagged(ok), 0, ok);
  // genuine universal claims about code are still strong
  for (const bad of [
    '`verifyToken` is defined in src/auth.js and called only from src/login.js.',
    '`src/cart.js` defines only `total(items)`.',
    'I removed all `console.log` calls from src/cart.js.',
    'Every caller of `getUser` now passes an id.',
  ]) assert.equal(flagged(bad, []), 1, bad);
  assert.deepEqual(identifiers('see `return verifyToken(t)` and `npm test | tail`'), ['verifyToken']);
});

test('type gaming rules', () => {
  const m = buildMatchers();
  const claim = (type: 'judge' | 'code' | 'run', text: string, extra: Record<string, string> = {}, loc?: string) => ({ type, text, fields: extra, line: 1, loc } as const);
  assert.equal(typeGaming(claim('run', 'tests pass', { cmd: 'x' }), m), null);
  assert.equal(typeGaming(claim('judge', 'looks fine'), m), null);
  assert.equal(typeGaming(claim('code', 'returns null', { quote: 'x' }, 'a.js:1'), m), null);
  const g1 = typeGaming(claim('judge', 'all tests pass'), m, 'npm test');
  assert.equal(g1?.kind, 'retype');
  assert.equal(g1?.kind === 'retype' && g1.claim.fields.cmd, 'npm test');
  assert.equal(typeGaming(claim('judge', 'all tests pass'), m)?.kind, 'strong');
});

test('ledger: redaction, tail, parse, prune, sessions', () => {
  const secrets = 'AKIAABCDEFGHIJKLMNOP ghp_abcdefghijklmnopqrstuvwxyz0123 sk-abcdefghijklmnopqrstuvwx password=hunter2 Bearer abcdefghijklmnop12345 postgres://u:pw@host/db eyJhbGciOiJI.eyJzdWIiOiIx.abcdefghijk xoxb-1234567890-abc TOKEN: "s3cret value"\n-----BEGIN RSA PRIVATE KEY-----\nMIIB\n-----END RSA PRIVATE KEY-----';
  const r = redact(secrets);
  for (const leak of ['AKIAABCDEFGHIJKLMNOP', 'ghp_abc', 'sk-abc', 'hunter2', 'abcdefghijklmnop12345', ':pw@', 'eyJhbGci', 'xoxb-', 's3cret', 'MIIB']) assert.ok(!r.includes(leak), leak);
  assert.equal(redact('nothing secret'), 'nothing secret');
  const long = Array.from({ length: 100 }, (_, i) => `line ${i}`).join('\n') + '\n\n';
  const t = tailLines(long, 40).split('\n');
  assert.equal(t.length, 40);
  assert.equal(t[39], 'line 99');
  assert.ok(tailLines('x'.repeat(1000)).length < 450);

  const dir = mkdir();
  const f = path.join(dir, '.receipts', 'ledger.jsonl');
  for (let i = 0; i < 25; i++) appendEntry(f, { session: `s${i}`, ts: 't', agent: 'a', kind: 'web', url: 'u' + i });
  appendEntry(f, { session: 's0', ts: 't', agent: 'a', kind: 'web', url: 'again' });
  fs.appendFileSync(f, 'not json\n{"kind":"x"}\n');
  assert.equal(readLedger(f).length, 26);
  assert.equal(pruneLedger(f, 20), 5);
  const left = readLedger(f);
  assert.equal(new Set(left.map((e) => e.session)).size, 20);
  assert.ok(left.some((e) => e.session === 's0'), 'a recently active session survives');
  assert.equal(pruneLedger(f, 20), 0);
  assert.deepEqual(sessionEntries(left, 's0').map((e) => e.kind), ['web', 'web'].slice(0, sessionEntries(left, 's0').length));
  assert.equal(sessionEntries(left)[0].session, 's0');
  assert.deepEqual(sessionEntries([]), []);
  assert.deepEqual(readLedger(path.join(dir, 'missing.jsonl')), []);
  assert.equal(parseLedger('\n\n').length, 0);
});

test('config: defaults, validation, detection', () => {
  const d = mkdir();
  assert.deepEqual(loadConfig(d), normaliseConfig(null));
  write(d, { '.receipts.json': '{ bad json' });
  assert.equal(loadConfig(d).mode, 'warn', 'default mode is warn (benchmark ship rule)');
  write(d, { '.receipts.json': JSON.stringify({ mode: 'strict', testCommand: ' npm test ', buildCommand: 5, ignore: ['dist/**', 3], lexicon: { extraUniversal: ['x'], extraJudge: 'no' }, maxRetries: 9 }) });
  const c = loadConfig(d);
  assert.deepEqual([c.mode, c.testCommand, c.buildCommand, c.ignore, c.lexicon.extraUniversal, c.lexicon.extraJudge, c.maxRetries], ['strict', 'npm test', undefined, ['dist/**'], ['x'], [], 2]);
  assert.equal(normaliseConfig({ mode: 'nope', maxRetries: -3 }).maxRetries, 0);
  assert.equal(normaliseConfig({ untaggedClaims: 'report' }).untaggedClaims, 'report');
  assert.equal(normaliseConfig({ untaggedClaims: 'x' }).untaggedClaims, 'block');
  assert.equal(normaliseConfig('x').mode, 'warn');
  const j = mkdir();
  write(j, { 'package.json': '{"scripts":{"test":"jest","build":"tsc"}}' });
  assert.deepEqual(detectCommands(j), { test: 'npm test', build: 'npm run build' });
  write(j, { 'bad/package.json': '{' });
  const mk = mkdir();
  write(mk, { Makefile: 'test:\n\techo\nbuild:\n\techo\n' });
  assert.deepEqual(detectCommands(mk), { test: 'make test', build: 'make build' });
  const py = mkdir();
  write(py, { 'pyproject.toml': '[tool.pytest.ini_options]\n' });
  assert.equal(detectCommands(py).test, 'pytest');
  const go = mkdir();
  write(go, { 'go.mod': 'module x' });
  assert.equal(detectCommands(go).test, 'go test ./...');
  const rs = mkdir();
  write(rs, { 'Cargo.toml': '[package]' });
  assert.equal(detectCommands(rs).build, 'cargo build');
  const bad = mkdir();
  write(bad, { 'package.json': '{' });
  assert.deepEqual(detectCommands(bad), {});
  const pt = mkdir();
  write(pt, { 'pytest.ini': '' });
  assert.equal(detectCommands(pt).test, 'pytest');
});

test('state: reset per turn, bounded size', () => {
  const f = path.join(mkdir(), 's', 'state.json');
  assert.deepEqual(loadState(f), { sessions: {} });
  resetTurn(f, 'a');
  const s = loadState(f);
  assert.equal(s.currentSession, 'a');
  s.sessions.a.blocks = 1;
  for (let i = 0; i < 30; i++) s.sessions['x' + i] = { blocks: 0 };
  saveState(f, s);
  assert.ok(Object.keys(loadState(f).sessions).length <= 20);
  resetTurn(f, 'a');
  assert.equal(loadState(f).sessions.a.blocks, 0);
  fs.writeFileSync(f, 'garbage');
  assert.deepEqual(loadState(f), { sessions: {} });
});

test('policy: modes, caps, reasons', () => {
  const claim = { type: 'absent' as const, text: 't', fields: {}, line: 1 };
  const bad = { claim, label: 'CONTRADICTED' as const, summary: 'found 2', evidence: [], note: '' };
  const ok = { claim, label: 'VERIFIED' as const, summary: 's', evidence: [], note: '' };
  const cfg = { ...DEFAULT_CONFIG, mode: 'block' as const };
  assert.equal(DEFAULT_CONFIG.mode, 'warn');
  assert.equal(decide([ok], cfg, { blocksSoFar: 0 }).block, false);
  assert.equal(decide([bad], cfg, { blocksSoFar: 0 }).block, true);
  assert.equal(decide([bad], { ...cfg, maxRetries: 2 }, { blocksSoFar: 1 }).block, true);
  assert.equal(decide([bad], { ...cfg, maxRetries: 9 }, { blocksSoFar: 2 }).block, false);
  assert.equal(decide([bad], { ...cfg, maxRetries: 0 }, { blocksSoFar: 0 }).block, false);
  assert.equal(decide([bad], { ...cfg, mode: 'warn' }, { blocksSoFar: 0 }).wouldBlock, false);
  const stale = { ...ok, label: 'UNVERIFIED' as const, stale: true, summary: 'STALE' };
  assert.equal(decide([stale], cfg, { blocksSoFar: 0 }).block, true);
  const timeout = { ...bad, reason: 'timeout' as const };
  assert.equal(decide([timeout], cfg, { blocksSoFar: 0 }).block, false);
  const uni = { ...ok, label: 'UNVERIFIED' as const, universal: true };
  assert.equal(decide([uni], cfg, { blocksSoFar: 0 }).block, false);
  assert.equal(decide([uni], { ...cfg, mode: 'strict' }, { blocksSoFar: 0 }).block, true);
  assert.equal(reasonFor(ok), null);
  assert.match(blockMessage(decide([bad], cfg, { blocksSoFar: 0 })), /^1\. You said "t"\. found 2\..*Format reminder/s);
});

test('report formatting', () => {
  const claim = (text: string) => ({ type: 'absent' as const, text, fields: {}, line: 1 });
  const results = [
    { claim: claim('a'.repeat(80)), label: 'VERIFIED' as const, summary: 'ok', evidence: [], note: 'static' },
    { claim: claim('b'), label: 'CITED' as const, summary: 'cited', evidence: [], note: 'meaning not checked' },
    { claim: claim('c'), label: 'CONTRADICTED' as const, summary: 'bad', evidence: [], note: '' },
    { claim: claim('d'), label: 'UNVERIFIED' as const, summary: 'meh', evidence: [], note: '', checkedAs: 'run' as const },
  ];
  assert.deepEqual(counts(results), { total: 4, verified: 1, cited: 1, contradicted: 1, unverified: 1 });
  const plain = formatReport({ results, warnings: [{ sentence: 'It is safe.', category: 'judgment' }], elapsedMs: 400, capped: true });
  assert.match(plain, /🧾 Receipts — 4 claims · 1 verified · 1 cited · 1 contradicted · 1 unverified {3}\(0\.4s\)/);
  assert.match(plain, /✅ a+… \.+ ok/);
  assert.match(plain, /❌ "c" \.+ bad/);
  assert.match(plain, /not blocking again/);
  assert.match(plain, /note \(judgment/);
  assert.ok(!plain.includes('\u001b'));
  assert.ok(formatReport({ results, warnings: [], elapsedMs: 1 }, true).includes('\u001b[31m'));
  assert.equal(formatReport({ results: [], warnings: [], elapsedMs: 0 }), '🧾 no claims');
  assert.match(formatReport({ results: results.slice(0, 1), warnings: [], elapsedMs: 0 }), /1 claim · 1 verified/);
});

test('syntax: tree-sitter classification for JS, TS, Python, Go, Java', async () => {
  const cases: [string, string, boolean[]][] = [
    ['a.js', 'foo();\n// foo\nconst s = "foo";\nconst t = `${foo()}`;\n/* foo */\n', [true, false, false, true, false]],
    ['a.ts', 'foo();\nconst s: string = \'foo\';\n// foo\n', [true, false, false]],
    ['a.tsx', 'const x = <div>{foo()}</div>;\n// foo\n', [true, false]],
    ['a.py', 'foo()\n# foo\nx = "foo"\n"""\nfoo\n"""\n', [true, false, false, false]],
    ['a.go', 'package a\nfunc g() { foo() }\n// foo\nvar s = "foo"\n', [true, false, false]],
    ['A.java', 'class A { void f() { foo(); } }\n// foo\nclass B { String s = "foo"; }\n', [true, false, false]],
  ];
  for (const [file, content, expectCode] of cases) {
    const lines = content.split('\n').map((l, i) => [l, i + 1] as const).filter(([l]) => /foo/.test(l)).map(([, i]) => i);
    const r = await classifyHits(file, content, lines, 'foo');
    assert.equal(r.viaTreeSitter, true, file);
    const got = lines.map((l) => r.code.includes(l));
    assert.deepEqual(got, expectCode, `${file} ${JSON.stringify(got)}`);
  }
  const rb = await classifyHits('a.rb', 'foo\n# foo\nx = "foo"\n', [1, 2, 3], 'foo');
  assert.equal(rb.viaTreeSitter, false);
  assert.deepEqual(rb.code, [1]);
  assert.deepEqual(rb.other.map((o) => o.kind), ['comment', 'string']);
  assert.deepEqual(occurrences('foo foobar xfoo foo_', 'foo'), [0]);
  assert.deepEqual(occurrences('$a + $a', '$a'), [0, 5]);
  assert.equal(languageFor('x.TS'), 'typescript');
  assert.equal(languageFor('x.rb'), null);
  assert.ok(isCodeFile('a.py') && isCodeFile('a.rb') && !isCodeFile('a.md'));
  assert.equal(heuristicKind('  * foo', 4, '.c'), 'comment');
  assert.equal(heuristicKind('x = 1 // foo', 9, '.c'), 'comment');
  assert.equal(heuristicKind('x = "// foo"', 8, '.c'), 'string');
  assert.equal(heuristicKind('x = 1 /* foo */', 11, '.c'), 'comment');
  assert.equal(heuristicKind('x = 1 # foo', 8, '.rb'), 'comment');
  assert.equal(heuristicKind('-- foo', 3, '.lua'), 'comment');
  assert.equal(heuristicKind('foo()', 0, '.c'), 'code');
});

test('only: definition and export-line detection', () => {
  for (const l of ['function foo(a) {', 'export async function foo() {', 'def foo(self):', 'func foo() int {', 'func (s *S) foo() {', 'const foo = (a) => {', 'const foo = async function () {', 'exports.foo = function () {}', 'foo(a) {', '  public static int foo(int a) {', 'class foo {', 'let foo = x => x']) {
    assert.ok(isDefinition(l, 'foo'), l);
  }
  for (const l of ['foo(1);', 'const x = foo(2);', 'return foo(x)', "const foo = require('./a');", 'if (foo(a)) {']) assert.ok(!isDefinition(l, 'foo'), l);
  for (const l of ['module.exports = { foo };', 'exports.foo = foo;', 'export { foo };', 'export default foo;', '__all__ = ["foo"]']) assert.ok(isExportLine(l), l);
  assert.ok(!isExportLine('foo();'));
});

test('dependencies across ecosystems', async () => {
  const dir = mkRepo({
    'package.json': '{\n "dependencies": {\n  "bcrypt": "^5.1.0"\n },\n "devDependencies": { "jest": "29.0.0" }\n}',
    'package-lock.json': JSON.stringify({ packages: { 'node_modules/bcrypt': { version: '5.1.1' }, 'node_modules/jest/node_modules/chalk': { version: '4.0.0' } } }),
    'yarn.lock': 'lodash@^4.17.0:\n  version "4.17.21"\n',
    'pnpm-lock.yaml': 'packages:\n  /left-pad@1.3.0:\n    resolution: {}\n',
    'requirements.txt': '# c\nFlask[async]==2.0.1\nrequests>=2\nPy_Yaml\n',
    'pyproject.toml': '[project]\ndependencies = ["numpy>=1.2", "Pandas"]\n[tool.poetry.dependencies]\npython = "^3.9"\ndjango = "^4.0"\nattrs = { version = "23.1" }\n',
    'uv.lock': '[[package]]\nname = "numpy"\nversion = "1.26.0"\n',
    'go.mod': 'module x\n\nrequire (\n\tgithub.com/gin-gonic/gin v1.9.0\n)\nrequire github.com/pkg/errors v0.9.1\n',
    'go.sum': 'github.com/spf13/cobra v1.8.0 h1:abc\ngithub.com/spf13/cobra v1.8.0/go.mod h1:abc\n',
    'Cargo.toml': '[package]\nname = "x"\n[dependencies]\nserde = "1.0"\ntokio = { version = "1.2", features = [] }\n[dependencies.rand]\nversion = "0.8"\n[dev-dependencies]\ncriterion = "0.5"\n',
    'Cargo.lock': '[[package]]\nname = "serde"\nversion = "1.0.190"\n',
    'pom.xml': '<dependency>\n <artifactId>junit</artifactId>\n <version>4.13</version>\n</dependency>',
    'build.gradle': "dependencies {\n  implementation 'com.google.guava:guava:32.0'\n}\n",
    'sub/package.json': '{"dependencies":{"nested-dep":"1"}}',
  });
  const where = (n: string) => findDependency(dir, n);
  assert.equal(where('bcrypt').declared[0].line, 3);
  assert.equal(where('bcrypt').locked[0].version, '5.1.1');
  assert.equal(where('jest').declared[0].version, '29.0.0');
  assert.equal(where('chalk').locked.length, 1);
  assert.equal(where('lodash').locked[0].version, '4.17.21');
  assert.equal(where('left-pad').locked[0].version, '1.3.0');
  assert.equal(where('flask').declared[0].version, '2.0.1');
  assert.equal(where('py-yaml').declared.length, 1);
  assert.equal(where('numpy').declared.length, 1);
  assert.equal(where('numpy').locked[0].version, '1.26.0');
  assert.equal(where('pandas').declared.length, 1);
  assert.equal(where('django').declared[0].version, '^4.0');
  assert.equal(where('attrs').declared[0].version, '23.1');
  assert.equal(where('python').declared.length, 0);
  assert.equal(where('gin').declared[0].version, 'v1.9.0');
  assert.equal(where('github.com/pkg/errors').declared.length, 1);
  assert.equal(where('cobra').locked[0].version, 'v1.8.0');
  assert.equal(where('serde').declared[0].version, '1.0');
  assert.equal(where('tokio').declared[0].version, '1.2');
  assert.equal(where('rand').declared.length, 1);
  assert.equal(where('criterion').declared.length, 1);
  assert.equal(where('serde').locked[0].version, '1.0.190');
  assert.equal(where('junit').declared[0].version, '4.13');
  assert.equal(where('guava').declared[0].version, '32.0');
  assert.equal(where('nested-dep').declared[0].file, 'sub/package.json');
  assert.equal(where('nothing-here').declared.length + where('nothing-here').locked.length, 0);

  const o = (n: string, v?: string) => run(dir, block(`dep | ${n} is a dependency | name: ${n}${v ? ` | version: ${v}` : ''}`));
  assert.equal((await o('bcrypt')).results[0].label, 'VERIFIED');
  assert.match((await o('bcrypt')).results[0].note, /not checked as installed/);
  assert.equal((await o('bcrypt', '5.1.1')).results[0].label, 'VERIFIED');
  assert.equal((await o('bcrypt', '^5')).results[0].label, 'VERIFIED');
  assert.equal((await o('bcrypt', '6.0.0')).results[0].label, 'CONTRADICTED');
  const lockOnly = await o('chalk');
  assert.equal(lockOnly.results[0].label, 'UNVERIFIED');
  assert.match(lockOnly.results[0].summary, /only in package-lock\.json/);
  assert.equal((await o('missing-thing')).results[0].label, 'CONTRADICTED');
  assert.equal((await o('bad name!')).results[0].label, 'UNVERIFIED');
  const empty = mkRepo({ 'a.txt': 'a' });
  assert.equal((await run(empty, block('dep | x | name: x'))).results[0].reason, 'unchecked');
  assert.equal(verifyDep.length, 2);
});

test('search: git grep fallback and result caps', async () => {
  const dir = mkRepo({ 'a.js': 'needle one\n', 'b/c.js': 'needle two\nneedle three\n', 'dist/x.js': 'needle ignored\n', 'node_modules/m/i.js': 'needle nm\n' });
  write(dir, { 'untracked.js': 'needle untracked\n' });
  const deadline = Date.now() + 5000;
  const viaRg = await search(dir, { pattern: 'needle', ignore: ['dist/**'], deadline });
  assert.equal(viaRg.engine, 'rg');
  assert.deepEqual(viaRg.hits.map((h) => h.file).sort(), ['a.js', 'b/c.js', 'b/c.js', 'untracked.js']);
  const prev = process.env.RECEIPTS_RG;
  process.env.RECEIPTS_RG = '/nonexistent/rg';
  try {
    const viaGit = await search(dir, { pattern: 'needle', ignore: ['dist'], deadline });
    assert.equal(viaGit.engine, 'git-grep');
    assert.deepEqual(viaGit.hits.map((h) => h.file).sort(), ['a.js', 'b/c.js', 'b/c.js', 'untracked.js']);
    const fixed = await search(dir, { pattern: 'needle t', fixed: true, word: true, ignore: [], deadline });
    assert.equal(fixed.hits.length, 0);
    assert.equal((await search(dir, { pattern: '(', ignore: [], deadline })).error !== undefined, true);
    assert.equal((await search(dir, { pattern: 'needle', ignore: [], deadline, maxHits: 1 })).truncated, true);
  } finally {
    if (prev === undefined) delete process.env.RECEIPTS_RG;
    else process.env.RECEIPTS_RG = prev;
  }
  assert.equal((await search(dir, { pattern: 'needle', ignore: [], deadline, maxHits: 1 })).truncated, true);
  assert.equal((await search(dir, { pattern: '(', ignore: [], deadline })).error !== undefined, true);
  assert.equal((await search(dir, { pattern: 'x', ignore: [], deadline: Date.now() - 1 })).timedOut, true);
  write(dir, { '.claude/skills/receipts/SKILL.md': 'needle in our own skill\n' });
  assert.ok(!(await search(dir, { pattern: 'needle', ignore: [], deadline })).hits.some((h) => h.file.startsWith('.claude/skills/receipts')), "Receipts' own skill is never searched");
  const nogit = mkdir();
  write(nogit, { 'a.txt': 'hay needle\n' });
  assert.equal((await search(nogit, { pattern: 'needle', ignore: [], deadline })).hits.length, 1);
});

test('ledger hook: real Claude Code payloads', async () => {
  const load = (n: string) => JSON.parse(fs.readFileSync(path.join(FIX, 'claude-code', n), 'utf8'));
  const ok = (await entryFromClaude(load('PostToolUse.Bash.json')))!;
  assert.ok(ok.kind === 'shell');
  if (ok.kind === 'shell') assert.deepEqual([ok.cmd, ok.exit, ok.exit_trusted, ok.agent, ok.out_tail], ['echo hi', 0, true, 'claude-code', 'hi']);
  const fail = (await entryFromClaude(load('PostToolUseFailure.Bash.json')))!;
  if (fail.kind === 'shell') {
    assert.equal(fail.exit, 2);
    assert.match(fail.out_tail ?? '', /No such file/);
    assert.ok(!(fail.out_tail ?? '').startsWith('Exit code'));
  }
  assert.equal(await entryFromClaude(load('Stop.json')), null);
  assert.equal(await entryFromClaude(null), null);
  const bg = { ...load('PostToolUse.Bash.json'), tool_input: { command: 'npm test', run_in_background: true } };
  const bge = (await entryFromClaude(bg))!;
  if (bge.kind === 'shell') assert.deepEqual([bge.exit, bge.exit_trusted], [null, false]);
  const piped = { ...load('PostToolUse.Bash.json'), tool_input: { command: 'npm test | tail -5' } };
  const pe = (await entryFromClaude(piped))!;
  if (pe.kind === 'shell') assert.equal(pe.exit_trusted, false);
  const web = (await entryFromClaude({ session_id: 's', hook_event_name: 'PostToolUse', tool_name: 'WebFetch', tool_input: { url: 'https://a.example' } }))!;
  assert.deepEqual([web.kind, (web as { url: string }).url], ['web', 'https://a.example']);
  assert.equal(await entryFromClaude({ session_id: 's', hook_event_name: 'PostToolUseFailure', tool_name: 'WebFetch', tool_input: { url: 'x' } }), null);
  assert.equal(await entryFromClaude({ session_id: 's', hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: {} }), null);
  assert.equal(await entryFromClaude({ session_id: 's', hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'ls' } }), null);
  const odd = (await entryFromClaude({ session_id: 's', hook_event_name: 'PostToolUseFailure', tool_name: 'Bash', tool_input: { command: 'x' }, error: 'weird' }))!;
  if (odd.kind === 'shell') assert.equal(odd.exit, null);
  const redacted = (await entryFromClaude({ session_id: 's', hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'curl -H "Authorization: Bearer abcdefghijklmnopqrstu" x' }, tool_response: { stdout: 'token=abc123', stderr: '' } }))!;
  if (redacted.kind === 'shell') assert.ok(!redacted.cmd.includes('abcdefghijklmnopqrstu') && !(redacted.out_tail ?? '').includes('abc123'));
});

test('snapshot: changes with edits, untracked files, and is stable otherwise', async () => {
  const dir = mkRepo({ 'a.js': 'a\n' });
  const s1 = await takeSnapshot(dir);
  assert.ok(s1?.startsWith('git:'));
  assert.equal(await takeSnapshot(dir), s1);
  write(dir, { '.receipts/ledger.jsonl': 'x' });
  assert.equal(await takeSnapshot(dir), s1, '.receipts is excluded');
  write(dir, { 'new.js': 'n\n' });
  const s2 = await takeSnapshot(dir);
  assert.notEqual(s2, s1);
  fs.writeFileSync(path.join(dir, 'a.js'), 'changed\n');
  assert.notEqual(await takeSnapshot(dir), s2);
  const fresh = mkdir();
  write(fresh, { 'a.js': 'a' });
  const { execFileSync } = await import('node:child_process');
  execFileSync('git', ['init', '-q'], { cwd: fresh });
  assert.ok((await takeSnapshot(fresh))?.startsWith('git:'), 'repo without commits');
  const big = mkdir();
  for (let i = 0; i < 3; i++) write(big, { [`f${i}.txt`]: 'x' });
  assert.ok((await takeSnapshot(big))?.startsWith('mtime:'));
});

test('judge ledger helpers', async () => {
  const dir = mkRepo({ 'package.json': '{"scripts":{"test":"jest"}}' });
  const e = await shellEntry(dir, 'npm test', { out: JEST_OK });
  assert.ok(e.kind === 'shell' && e.summary?.passed === 42 && typeof e.snap === 'string');
});

test('heredoc bodies are data, not commands (seen in real benchmark runs)', () => {
  const cmd = "cat > cart/orderid.go <<'EOF'\npackage cart\nnpm test -- login\nfunc X() {}\nEOF\ngo test ./...";
  const segs = analyseCommand(cmd).map((s) => s.norm);
  assert.deepEqual(segs, ["cat > cart/orderid.go <<'EOF'", 'go test ./...']);
  assert.equal(analyseCommand(cmd)[1].masked, false);
  // <<- strips leading tabs from the delimiter line; several heredocs on one line are all skipped
  assert.deepEqual(analyseCommand('cat <<-END\n\tbody | tail\n\tEND\nnpm test').map((s) => s.norm), ['cat <<-END', 'npm test']);
  assert.deepEqual(analyseCommand('cat <<A <<"B"\na\nA\nb\nB\nls').map((s) => s.norm), ['cat <<A <<"B"', 'ls']);
  // not heredocs: here-strings, quoted <<, arithmetic shifts
  assert.deepEqual(analyseCommand("grep x <<< 'y'; ls").map((s) => s.norm), ["grep x <<< 'y'", 'ls']);
  assert.deepEqual(analyseCommand('echo "<<EOF"\nls').map((s) => s.norm), ['echo "<<EOF"', 'ls']);
  assert.deepEqual(analyseCommand('echo $((1 << 2))\nls').map((s) => s.norm), ['echo $((1 << 2))', 'ls']);
  // an unterminated heredoc swallows the rest (as bash would)
  assert.deepEqual(analyseCommand('cat <<EOF\nnpm test').map((s) => s.norm), ['cat <<EOF']);
});

test('an unescaped | inside a value is glued back (regex alternation in a real run)', () => {
  const c = parseLine('absent | no debug prints | pattern: \\[debug\\] (items|total)', 1);
  assert.equal(c.type, 'absent');
  assert.equal(c.fields.pattern, '\\[debug\\] (items|total)');
  const j = parseLine('judge | a | b stays text', 1);
  assert.equal(j.text, 'a|b stays text');
  const code = parseLine('code | x | src/a.js:3 | quote: a | b', 1);
  assert.deepEqual([code.loc, code.fields.quote], ['src/a.js:3', 'a|b']);
});

test('ledger: deferred snapshot lines merge into their entry; orphans and pending ids are harmless', () => {
  const lines = [
    JSON.stringify({ session: 's', ts: 't', agent: 'a', kind: 'shell', cmd: 'npm test', exit: 0, exit_trusted: true, snap_id: 'x1' }),
    JSON.stringify({ session: 's', ts: 't', agent: 'a', kind: 'shell', cmd: 'npm test', exit: 0, exit_trusted: true, snap_id: 'pending' }),
    JSON.stringify({ kind: 'snap', id: 'x1', snap: 'git:abc' }),
    JSON.stringify({ kind: 'snap', id: 'orphan', snap: 'git:zzz' }),
  ].join('\n');
  const [a, b] = parseLedger(lines);
  assert.ok(a.kind === 'shell' && a.snap === 'git:abc' && !a.snap_id);
  assert.ok(b.kind === 'shell' && b.snap_id === 'pending' && b.snap === undefined);
  assert.equal(parseLedger(lines).length, 2);
});

test('search hit paths are repo-relative with forward slashes on every platform', async () => {
  const { normaliseHitPath } = await import('./search.js');
  assert.equal(normaliseHitPath('./src/a.js', 'linux'), 'src/a.js');
  assert.equal(normaliseHitPath('.\\src\\a.js', 'win32'), 'src/a.js');
  assert.equal(normaliseHitPath('src\\weird\\name.js', 'linux'), 'src\\weird\\name.js', 'a backslash is a valid filename character on POSIX');
});
