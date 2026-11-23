import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { block, JEST_FAIL, JEST_OK, mkRepo, run, shellEntry, write, mkdir } from './testutil.js';

const PKG = JSON.stringify({ name: 'x', scripts: { test: 'jest', build: 'tsc' } });

const AUTH = `function verifyToken(t) {\n  if (!t) return null;\n  return { ok: true };\n}\nmodule.exports = { verifyToken };\n`;
const LOGIN = `const { verifyToken } = require('./auth');\nfunction login(t) {\n  return verifyToken(t);\n}\nmodule.exports = { login };\n`;

const byClaim = (out: Awaited<ReturnType<typeof run>>, i = 0) => out.results[i];

test('1. false "all tests pass" after a filtered run -> CONTRADICTED subset', async () => {
  const dir = mkRepo({ 'package.json': PKG, 'a.js': 'x' });
  const ledger = [await shellEntry(dir, 'npm test -- login', { out: JEST_OK })];
  const out = await run(dir, block('run | all tests pass | cmd: npm test -- login'), ledger);
  assert.equal(byClaim(out).label, 'CONTRADICTED');
  assert.equal(byClaim(out).reason, 'subset');
  assert.match(byClaim(out).summary, /only a subset ran/);
  assert.equal(out.decision.block, true);
  // citing the full command that never ran is also a contradiction
  const out2 = await run(dir, block('run | all tests pass | cmd: npm test'), ledger);
  assert.equal(byClaim(out2).label, 'CONTRADICTED');
  assert.match(byClaim(out2).summary, /never ran/);
});

test('2. `npm test | tail -20` with failing tests is not accepted as a pass', async () => {
  const dir = mkRepo({ 'package.json': PKG });
  const withSummary = [await shellEntry(dir, 'npm test | tail -20', { exit: 0, out: JEST_FAIL })];
  assert.equal(withSummary[0].kind === 'shell' && withSummary[0].exit_trusted, false);
  const a = await run(dir, block('run | tests pass | cmd: npm test'), withSummary);
  assert.equal(byClaim(a).label, 'CONTRADICTED');
  assert.match(byClaim(a).summary, /2 failed/);
  const noSummary = [await shellEntry(dir, 'npm test | tail -20', { exit: 0, out: 'some noise\nmore noise\n' })];
  const b = await run(dir, block('run | tests pass | cmd: npm test'), noSummary);
  assert.equal(byClaim(b).label, 'UNVERIFIED');
  assert.equal(byClaim(b).reason, 'masked');
});

test('3. a test command that collects 0 tests -> CONTRADICTED no tests executed', async () => {
  const dir = mkRepo({ 'package.json': PKG });
  const ledger = [await shellEntry(dir, 'npm test', { out: '  0 passing (2ms)\n' })];
  const out = await run(dir, block('run | all tests pass | cmd: npm test'), ledger);
  assert.equal(byClaim(out).label, 'CONTRADICTED');
  assert.match(byClaim(out).summary, /no tests executed/);
});

test('4. pass, then a code edit -> STALE and blocks; a re-run clears it', async () => {
  const dir = mkRepo({ 'package.json': PKG, 'src/a.js': 'let a = 1;\n' });
  const first = await shellEntry(dir, 'npm test', { out: JEST_OK });
  const msg = block('run | all tests pass | cmd: npm test');
  const fresh = await run(dir, msg, [first]);
  assert.equal(byClaim(fresh).label, 'VERIFIED', byClaim(fresh).summary);
  assert.equal(fresh.decision.block, false);

  fs.writeFileSync(path.join(dir, 'src/a.js'), 'let a = 2;\n');
  const stale = await run(dir, msg, [first]);
  assert.equal(byClaim(stale).label, 'UNVERIFIED');
  assert.equal(byClaim(stale).stale, true);
  assert.match(byClaim(stale).summary, /STALE/);
  assert.equal(stale.decision.block, true);

  const rerun = await shellEntry(dir, 'npm test', { out: JEST_OK });
  const cleared = await run(dir, msg, [first, rerun]);
  assert.equal(byClaim(cleared).label, 'VERIFIED');
  assert.equal(cleared.decision.block, false);
});

test('5. "only called from X" with a second caller in another folder -> CONTRADICTED with location', async () => {
  const dir = mkRepo({
    'src/auth.js': AUTH,
    'src/login.js': LOGIN,
    'lib/admin/panel.js': `const { verifyToken } = require('../../src/auth');\nexports.open = (t) => verifyToken(t);\n`,
  });
  const out = await run(dir, block('only | verifyToken is only called from login | symbol: verifyToken | in: src/login.js'));
  assert.equal(byClaim(out).label, 'CONTRADICTED');
  assert.match(byClaim(out).summary, /lib\/admin\/panel\.js:\d+/);
  assert.match(byClaim(out).note, /dynamic calls/);
  assert.equal(out.decision.block, true);
  // and without the extra caller it verifies
  const ok = mkRepo({ 'src/auth.js': AUTH, 'src/login.js': LOGIN });
  const out2 = await run(ok, block('only | verifyToken is only called from login | symbol: verifyToken | in: src/login.js'));
  assert.equal(byClaim(out2).label, 'VERIFIED', byClaim(out2).summary);
  assert.equal(out2.decision.block, false);
});

test('6. symbol only in a comment or string elsewhere -> no CONTRADICTED (no false block)', async () => {
  const dir = mkRepo({
    'src/auth.js': AUTH,
    'src/login.js': LOGIN,
    'src/notes.js': `// verifyToken used to be called here\nconst msg = "call verifyToken later";\nconst t = \`verifyToken is \${1}\`;\n/* verifyToken */\n`,
    'src/notes.py': `# verifyToken is gone\ndef f():\n    """verifyToken docs"""\n    return 'verifyToken'\n`,
    'src/Notes.java': `// verifyToken\nclass Notes { String s = "verifyToken"; }\n`,
    'src/notes.go': `package x\n// verifyToken\nvar s = "verifyToken"\n`,
    'docs/readme.md': 'call verifyToken to verify\n',
    'tools/x.rb': '# verifyToken is not used\nputs 1\n',
  });
  const out = await run(dir, block('only | verifyToken is only called from login | symbol: verifyToken | in: src/login.js'));
  assert.equal(byClaim(out).label, 'VERIFIED', byClaim(out).summary);
  assert.equal(out.decision.block, false);
  assert.match(byClaim(out).note, /strings\/comments ignored/);
});

test('6b. a real call inside a template-string substitution still counts', async () => {
  const dir = mkRepo({ 'src/auth.js': AUTH, 'src/login.js': LOGIN, 'src/t.js': 'const s = `x ${verifyToken(1)}`;\n' });
  const out = await run(dir, block('only | verifyToken only used in login | symbol: verifyToken | in: src/login.js'));
  assert.equal(byClaim(out).label, 'CONTRADICTED');
});

test('7. "removed all console.log" with leftovers -> CONTRADICTED with hits', async () => {
  const dir = mkRepo({ 'src/cart.js': 'console.log(1);\n', 'src/admin.js': 'x();\nconsole.log(2);\n', 'src/ok.js': 'ok();\n' });
  const out = await run(dir, block('absent | removed all console.log | pattern: console\\.log'));
  assert.equal(byClaim(out).label, 'CONTRADICTED');
  assert.match(byClaim(out).summary, /console\\\.log\/ → 2 hits/);
  assert.match(byClaim(out).summary, /src\/cart\.js:1/);
  assert.match(byClaim(out).summary, /src\/admin\.js:2/);
  assert.equal(out.decision.block, true);
  assert.match(out.blockMessage, /Format reminder/);
  // clean repo -> verified
  const clean = mkRepo({ 'src/ok.js': 'ok();\n' });
  const out2 = await run(clean, block('absent | no console.log left | pattern: console\\.log'));
  assert.equal(byClaim(out2).label, 'VERIFIED');
  assert.match(byClaim(out2).summary, /console\\\.log\/ → 0 hits/);
});

test('8. untagged universal claim with an identifier in the prose -> strong, blocks', async () => {
  const dir = mkRepo({ 'src/auth.js': AUTH });
  const out = await run(dir, 'I checked it. `verifyToken` is only called from login.js.');
  assert.equal(out.results.length, 1);
  assert.equal(out.results[0].strong, true);
  assert.equal(out.decision.block, true);
  // the same sentence is covered once a tagged claim holds its identifiers
  const tagged = await run(dir, 'I checked it. `verifyToken` is only called from login.js.\n' + block('only | verifyToken only from login.js | symbol: verifyToken | in: login.js'));
  assert.equal(tagged.results.filter((r) => r.strong).length, 0);
});

test('9. a judge line saying "tests pass" is checked as run', async () => {
  const dir = mkRepo({ 'package.json': PKG });
  const out = await run(dir, block('judge | all tests pass | cmd: npm test'));
  assert.equal(out.results[0].checkedAs, 'run');
  assert.equal(out.results[0].label, 'CONTRADICTED');
  assert.match(out.results[0].summary, /never ran/);
  // with a passing run it verifies as run
  const ledger = [await shellEntry(dir, 'npm test', { out: JEST_OK })];
  const ok = await run(dir, block('judge | all tests pass'), ledger);
  assert.equal(ok.results[0].label, 'VERIFIED');
  assert.equal(ok.results[0].checkedAs, 'run');
  // no command anywhere to check it with -> strong untagged
  const bare = mkRepo({ 'x.txt': 'x' });
  const bad = await run(bare, block('judge | all tests pass'));
  assert.equal(bad.results[0].strong, true);
  assert.equal(bad.decision.block, true);
});

test('9b. a code line saying "only called from" is checked as only', async () => {
  const dir = mkRepo({ 'src/auth.js': AUTH, 'src/login.js': LOGIN, 'lib/other.js': 'verifyToken(1);\n' });
  const out = await run(dir, block('code | `verifyToken` is only called from login | src/login.js:3 | quote: return verifyToken(t)'));
  assert.equal(out.results[0].checkedAs, 'only');
  assert.equal(out.results[0].label, 'CONTRADICTED');
  // universal claim on a code line with nothing to build it from -> strong
  const strong = await run(dir, block('code | every call to `verifyToken` is guarded | src/login.js:3 | quote: return verifyToken(t)'));
  assert.equal(strong.results[0].strong, true);
  // an only-claim that names no single symbol can't be re-typed
  const amb = await run(dir, block('code | only called from login | src/login.js:3 | quote: return verifyToken(t)'));
  assert.equal(amb.results[0].strong, true);
});

test('10. a turn with no claims -> no block, no noise', async () => {
  const dir = mkRepo({ 'a.txt': 'a' });
  for (const msg of ['Sure, I can do that. Which file should I start with?', "I'll fix all the bugs next.", '', 'Here is a plan:\n- step one\n- step two']) {
    const out = await run(dir, msg);
    assert.equal(out.decision.block, false);
    assert.equal(out.results.length, 0);
    assert.equal(out.text, '🧾 no claims');
  }
});

test('11. a second failed check in the same turn -> no second block; report shown', async () => {
  const dir = mkRepo({ 'src/cart.js': 'console.log(1);\n' });
  const msg = block('absent | removed all console.log | pattern: console\\.log');
  const first = await run(dir, msg, [], { blocksSoFar: 0 });
  assert.equal(first.decision.block, true);
  const second = await run(dir, msg, [], { blocksSoFar: 1 });
  assert.equal(second.decision.block, false);
  assert.equal(second.decision.capped, true);
  assert.match(second.text, /CONTRADICTED|console/);
  assert.match(second.text, /not blocking again/);
  const hookActive = await run(dir, msg, [], { blocksSoFar: 0, stopHookActive: true });
  assert.equal(hookActive.decision.block, false);
  const warn = await run(dir, msg, [], { config: { mode: 'warn', ignore: [], lexicon: { extraUniversal: [], extraJudge: [] }, maxRetries: 1 } });
  assert.equal(warn.decision.block, false);
  assert.equal(warn.decision.wouldBlock, false);
});

test('unparseable lines become untagged and are still scanned', async () => {
  const dir = mkRepo({ 'src/auth.js': AUTH });
  const out = await run(dir, block('verifyToken is only called from login.js without any pipes', 'code | missing the quote | src/auth.js:1', 'run | no cmd here'));
  assert.equal(out.results.length, 3);
  assert.ok(out.results.some((r) => r.strong), 'the universal line is flagged strong');
  assert.ok(out.results.filter((r) => r.reason === 'invalid').length >= 2);
});

test('code claim: quote off by one line is still CITED; off by five is not', async () => {
  const dir = mkRepo({ 'src/auth.js': AUTH });
  const near = await run(dir, block('code | missing token returns null | src/auth.js:3 | quote: return null'));
  assert.equal(near.results[0].label, 'CITED');
  assert.match(near.results[0].note, /not checked/);
  assert.equal(near.decision.block, false);
  const far = mkRepo({ 'a.js': 'return null;\n\n\n\n\n\n\n\nother\n' });
  const out = await run(far, block('code | x | a.js:9 | quote: return null'));
  assert.equal(out.results[0].label, 'CONTRADICTED');
  assert.equal(out.decision.block, true);
});

test('code claim: path escaping the root, symlink escapes, missing files and lines', async () => {
  const outside = mkdir();
  write(outside, { 'secret.txt': 'top secret\n' });
  const dir = mkRepo({ 'a.js': 'one\ntwo\n' }, { git: false });
  fs.symlinkSync(path.join(outside, 'secret.txt'), path.join(dir, 'link.txt'));
  for (const loc of ['../../etc/passwd:1', `${path.join(outside, 'secret.txt')}:1`, 'link.txt:1']) {
    const out = await run(dir, block(`code | x | ${loc} | quote: secret`));
    assert.equal(out.results[0].label, 'CONTRADICTED', loc);
    assert.match(out.results[0].summary, /outside repo root/, loc);
  }
  assert.match((await run(dir, block('code | x | nope.js:1 | quote: a'))).results[0].summary, /not found/);
  assert.match((await run(dir, block('code | x | a.js:99 | quote: a'))).results[0].summary, /does not exist/);
  assert.match((await run(dir, block('code | x | . :1 | quote: a'))).results[0].summary, /./);
});

test('absent: a pattern starting with -- is a pattern, not a flag', async () => {
  const dir = mkRepo({ 'a.txt': 'hello --pre=evil world\n', 'evil.sh': 'touch /tmp/receipts-pwned\n' });
  const out = await run(dir, block('absent | no --pre usage | pattern: --pre=evil'));
  assert.equal(out.results[0].label, 'CONTRADICTED');
  assert.match(out.results[0].summary, /a\.txt:1/);
  assert.equal(fs.existsSync('/tmp/receipts-pwned'), false);
  const flagLike = await run(dir, block('absent | none | pattern: -e'));
  assert.ok(['VERIFIED', 'CONTRADICTED'].includes(flagLike.results[0].label));
  const bad = await run(dir, block('absent | none | pattern: (unclosed'));
  assert.equal(bad.results[0].label, 'UNVERIFIED');
  assert.equal(bad.results[0].reason, 'invalid');
  assert.equal(bad.decision.block, false);
});

test('huge and binary files do not break the checker', async () => {
  const dir = mkRepo({ 'ok.js': 'ok();\n' }, { git: false });
  fs.writeFileSync(path.join(dir, 'big.js'), 'console.log(1);\n'.repeat(400_000)); // ~6.4 MB
  fs.writeFileSync(path.join(dir, 'bin.dat'), Buffer.from([0, 1, 2, 3, 0, 99, 111, 110, 115, 111, 108, 101, 46, 108, 111, 103]));
  const absent = await run(dir, block('absent | no console.log | pattern: console\\.log'));
  assert.equal(absent.results[0].label, 'VERIFIED', 'files over 1MB and binary files are skipped by the search');
  const big = await run(dir, block('code | x | big.js:1 | quote: console.log'));
  assert.equal(big.results[0].label, 'UNVERIFIED');
  assert.match(big.results[0].summary, /too large/);
  const bin = await run(dir, block('code | x | bin.dat:1 | quote: console'));
  assert.equal(bin.results[0].label, 'UNVERIFIED');
  assert.match(bin.results[0].summary, /binary/);
});

test('a non-git folder works; staleness uses mtimes', async () => {
  const dir = mkRepo({ 'package.json': PKG, 'a.js': 'a\n' }, { git: false });
  const e = await shellEntry(dir, 'npm test', { out: JEST_OK });
  assert.match((e as { snap?: string }).snap ?? '', /^mtime:/);
  const msg = block('run | all tests pass | cmd: npm test');
  assert.equal((await run(dir, msg, [e])).results[0].label, 'VERIFIED');
  const later = new Date(Date.now() + 5000);
  fs.writeFileSync(path.join(dir, 'a.js'), 'b\n');
  fs.utimesSync(path.join(dir, 'a.js'), later, later);
  const stale = await run(dir, msg, [e]);
  assert.equal(stale.results[0].stale, true);
  const abs = await run(dir, block('absent | none | pattern: zzz'));
  assert.equal(abs.results[0].label, 'VERIFIED');
});

test('timeout: remaining claims become UNVERIFIED (timeout) and never block', async () => {
  const dir = mkRepo({ 'a.js': 'console.log(1);\n' });
  const out = await run(dir, block('absent | none | pattern: console\\.log', 'absent | none | pattern: a'), [], { timeoutMs: 0 });
  assert.ok(out.results.every((r) => r.reason === 'timeout'));
  assert.equal(out.decision.block, false);
});

test('strict mode: an unverified universal claim blocks; judge claims alone do not', async () => {
  const dir = mkRepo({ 'a.js': 'a\n' });
  const strict = { mode: 'strict' as const, ignore: [], lexicon: { extraUniversal: [], extraJudge: [] }, maxRetries: 1 };
  const uni = await run(dir, block('judge | every caller handles null | source: https://example.com'), [], { config: strict });
  assert.equal(uni.decision.block, true);
  const plain = await run(dir, block('judge | this will not affect other callers'));
  assert.equal(plain.decision.block, false);
  assert.equal(plain.results[0].label, 'UNVERIFIED');
});

test('judge lists evidence: fetched source, test runs, referencing files', async () => {
  const dir = mkRepo({ 'package.json': PKG, 'src/auth.js': AUTH, 'src/login.js': LOGIN });
  const web = { session: 's1', ts: 'x', agent: 't', kind: 'web' as const, url: 'https://nextjs.org/docs/caching' };
  const out = await run(dir, block('judge | Next 15 does not cache fetch by default | source: https://nextjs.org/docs/caching', 'judge | changing `verifyToken` will not affect callers | source: https://other.example'), [web, await shellEntry(dir, 'npm test', { out: JEST_OK })]);
  assert.match(out.results[0].evidence.join('\n'), /source fetched/);
  assert.match(out.results[1].evidence.join('\n'), /NOT fetched/);
  assert.match(out.results[1].evidence.join('\n'), /reference `verifyToken`/);
  assert.match(out.results[1].evidence.join('\n'), /last test run/);
});

test('change: old gone and new present', async () => {
  const bad = mkRepo({ 'a.js': 'getUser();\nfetchUser();\n' });
  assert.equal((await run(bad, block('change | renamed getUser to fetchUser | old: getUser | new: fetchUser'))).results[0].label, 'CONTRADICTED');
  const ok = mkRepo({ 'a.js': 'fetchUser();\n' });
  assert.equal((await run(ok, block('change | renamed getUser to fetchUser | old: getUser | new: fetchUser'))).results[0].label, 'VERIFIED');
  const none = mkRepo({ 'a.js': 'x();\n' });
  assert.match((await run(none, block('change | renamed | old: getUser | new: fetchUser'))).results[0].summary, /not found/);
});

test('untagged "all tests passed" is checked from the ledger instead of blocking a true claim', async () => {
  const dir = mkRepo({ 'package.json': PKG, 'src/a.js': 'let a = 1;\n' });
  const msg = 'I ran `npm test` after the edits and all 42 tests passed.';
  // fresh passing run: verified, no block, and it says how it was checked
  const ok = await run(dir, msg, [await shellEntry(dir, 'npm test', { out: JEST_OK })]);
  assert.equal(ok.results.length, 1);
  assert.equal(ok.results[0].label, 'VERIFIED');
  assert.equal(ok.results[0].checkedAs, 'run');
  assert.match(ok.results[0].note, /no receipt was given; checked from the command ledger/);
  assert.equal(ok.decision.block, false);
  // a failing run: the claim is false, so it blocks
  const bad = await run(dir, msg, [await shellEntry(dir, 'npm test', { exit: 1, out: JEST_FAIL })]);
  assert.equal(bad.results[0].label, 'CONTRADICTED');
  assert.equal(bad.decision.block, true);
  // a filtered run: subset
  const sub = await run(dir, msg, [await shellEntry(dir, 'npm test -- login', { out: JEST_OK })]);
  assert.match(sub.results[0].summary, /subset/);
  assert.equal(sub.decision.block, true);
  // stale after an edit
  const e = await shellEntry(dir, 'npm test', { out: JEST_OK });
  fs.writeFileSync(path.join(dir, 'src/a.js'), 'let a = 2;\n');
  const stale = await run(dir, msg, [e]);
  assert.equal(stale.results[0].stale, true);
  assert.equal(stale.decision.block, true);
  // no test command ever ran: still a strong untagged claim
  const none = await run(dir, msg, []);
  assert.equal(none.results[0].strong, true);
  assert.equal(none.decision.block, true);
});

test('a receipt line with the keys where the claim text belongs still parses', async () => {
  const dir = mkRepo({ 'src/auth.js': AUTH, 'src/login.js': LOGIN });
  const out = await run(dir, block('only | symbol: verifyToken | in: src/login.js'));
  assert.equal(out.results[0].claim.type, 'only');
  assert.equal(out.results[0].label, 'VERIFIED');
  assert.equal(out.decision.block, false);
});

test('a differently-spelled command for the same runner is not accused of being a subset', async () => {
  const dir = mkRepo({ 'pytest.ini': '[pytest]\npythonpath = .\n', 'tests/test_a.py': 'def test_a():\n    assert True\n' });
  const PYOUT = '============ 3 passed in 0.01s ============\n';
  const same = await run(dir, block('run | all tests pass | cmd: python3 -m pytest -q tests'), [await shellEntry(dir, 'python3 -m pytest -q tests', { out: PYOUT })]);
  assert.equal(same.results[0].label, 'VERIFIED', same.results[0].summary);
  // a different runner than the configured one: unproven, not contradicted (never a block)
  const other = await run(dir, block('run | all tests pass | cmd: make check'), [await shellEntry(dir, 'make check', { out: PYOUT })]);
  assert.equal(other.results[0].label, 'UNVERIFIED');
  assert.equal(other.results[0].reason, 'subset');
  assert.equal(other.decision.block, false);
  // but a filter is still a contradiction
  const filt = await run(dir, block('run | all tests pass | cmd: python3 -m pytest tests/test_a.py'), [await shellEntry(dir, 'python3 -m pytest tests/test_a.py', { out: PYOUT })]);
  assert.equal(filt.results[0].label, 'CONTRADICTED');
});
