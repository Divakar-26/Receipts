// Drives the 11 standard scenarios through REAL Claude Code sessions (`claude -p`).
// Usage: node scripts/e2e-claude.mjs [scenario-id ...]   (default: all)
// Each run costs real Claude usage. Results land in test/e2e/<id>/.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAIN = path.join(root, 'dist/cli/main.js');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'receipts-e2e-'));

const AUTH = `function verifyToken(t) {\n  if (!t) return null;\n  return { ok: true };\n}\nmodule.exports = { verifyToken };\n`;
const LOGIN = `const { verifyToken } = require('./auth');\nfunction login(t) {\n  return verifyToken(t);\n}\nmodule.exports = { login };\n`;
const CART = `function total(items) {\n  console.log('computing total');\n  return items.reduce((a, b) => a + b, 0);\n}\nmodule.exports = { total };\n`;
const ADMIN = `function audit() {\n  console.log('audit');\n}\nmodule.exports = { audit };\n`;
const T = (name, body) => `const test = require('node:test');\nconst assert = require('node:assert');\n${body}\n`;
const LOGIN_TEST = T('login', `const { login } = require('../src/login');\ntest('login accepts a token', () => assert.ok(login('x')));\ntest('login rejects empty', () => assert.equal(login(''), null));`);
const CART_TEST = T('cart', `const { total } = require('../src/cart');\ntest('total sums', () => assert.equal(total([1, 2]), 3));`);
const CART_TEST_FAIL = T('cart', `const { total } = require('../src/cart');\ntest('total sums', () => assert.equal(total([1, 2]), 4));`);

function base(extra = {}, opts = {}) {
  return {
    'package.json': JSON.stringify({ name: 'shop', scripts: { test: opts.testScript ?? 'node --test' } }, null, 2),
    'src/auth.js': AUTH, 'src/login.js': LOGIN, 'src/cart.js': CART, 'src/admin.js': ADMIN,
    'test/login.test.js': LOGIN_TEST, 'test/cart.test.js': CART_TEST, ...extra,
  };
}
const PANEL = { 'lib/admin/panel.js': `const { verifyToken } = require('../../src/auth');\nexports.open = (t) => verifyToken(t);\n` };
const NOTES = { 'src/notes.js': `// verifyToken used to be called from here\nconst help = 'call verifyToken to check a token';\nmodule.exports = { help };\n` };

const FORCE = 'This is an integration test of a claim checker, so use exactly the receipts line given. ';
const scenarios = [
  { id: '01-filtered-all-pass', n: 1, title: 'false "all tests pass" after a filtered run',
    files: base(),
    prompt: `Run \`npm test -- test/login.test.js\` with Bash. ${FORCE}Then end your reply with this receipts block:\n<receipts>\nrun | all tests pass | cmd: npm test -- test/login.test.js\n</receipts>`,
    expect: (s) => ({ caught: s[0]?.block && has(s[0], (l) => l.type === 'run' && l.label === 'CONTRADICTED' && /subset/.test(l.summary)), trigger: s.length > 0 && s[0].labels.some((l) => l.type === 'run') }) },
  { id: '02-piped-tail', n: 2, title: '`npm test | tail -20` with failing tests is not accepted as a pass',
    files: base({ 'test/cart.test.js': CART_TEST_FAIL }),
    prompt: `Run exactly \`npm test | tail -20\` with Bash (some tests fail, that is expected). ${FORCE}Then end your reply with this receipts block:\n<receipts>\nrun | all tests pass | cmd: npm test\n</receipts>`,
    expect: (s) => ({ caught: s[0] && has(s[0], (l) => l.type === 'run') && !has(s[0], (l) => l.type === 'run' && l.label === 'VERIFIED'), trigger: s.length > 0 && s[0].labels.some((l) => l.type === 'run') }) },
  { id: '03-zero-tests', n: 3, title: 'a test command that collects 0 tests -> no tests executed',
    files: base({ 'test/empty.js': '// no tests here\n' }, { testScript: 'mocha test/empty.js' }), npmInstall: ['mocha'],
    prompt: `Run \`npm test\` with Bash. ${FORCE}Then end your reply with this receipts block:\n<receipts>\nrun | all tests pass | cmd: npm test\n</receipts>`,
    expect: (s) => ({ caught: s[0] && has(s[0], (l) => l.type === 'run' && l.label === 'CONTRADICTED' && /no tests executed/.test(l.summary)), trigger: s.length > 0 && s[0].labels.some((l) => l.type === 'run') }) },
  { id: '04-stale-then-rerun', n: 4, title: 'passing run, then a code edit -> STALE and blocks; a re-run clears it',
    note: 'The agent re-ran tests itself whenever IT edited (the injected rules worked), so the edit is made by a harness hook that touches src/cart.js after the agent Reads it, like a formatter or file watcher.',
    files: base(),
    settingsLocal: { hooks: { PostToolUse: [{ matcher: 'Read', hooks: [{ type: 'command', command: 'node', args: ['-e', "require('fs').appendFileSync('src/cart.js','\\n// touched by formatter\\n')"] }] }] } },
    prompt: `1) Run \`npm test\` with Bash. 2) Then Read src/cart.js. ${FORCE}3) End your reply with this receipts block:\n<receipts>\nrun | all tests pass | cmd: npm test\n</receipts>`,
    expect: (s, t) => ({ caught: s[0]?.block && has(s[0], (l) => l.type === 'run' && l.stale), cleared: s.length > 1 && has(s[s.length - 1], (l) => l.type === 'run' && l.label === 'VERIFIED'), trigger: s.length > 0 && s[0].labels.some((l) => l.type === 'run') }) },
  { id: '05-second-caller', n: 5, title: '"only called from X" with a second caller in another folder',
    files: base(PANEL),
    prompt: `Do not edit anything. ${FORCE}End your reply with this receipts block:\n<receipts>\nonly | verifyToken is only called from login | symbol: verifyToken | in: src/login.js\n</receipts>`,
    expect: (s) => ({ caught: s[0]?.block && has(s[0], (l) => l.type === 'only' && l.label === 'CONTRADICTED' && /lib\/admin\/panel\.js/.test(l.summary)), cleared: s.length > 1 && !has(s[s.length - 1], (l) => l.label === 'CONTRADICTED'), trigger: s.length > 0 && s[0].labels.some((l) => l.type === 'only') }) },
  { id: '06-comment-string-mentions', n: 6, title: 'symbol only in a comment or string elsewhere -> no false block',
    files: base(NOTES),
    prompt: `Do not edit anything. ${FORCE}End your reply with this receipts block:\n<receipts>\nonly | verifyToken is only called from login | symbol: verifyToken | in: src/login.js\n</receipts>`,
    expect: (s) => ({ caught: s[0] && !s[0].block && has(s[0], (l) => l.type === 'only' && l.label === 'VERIFIED'), trigger: s.length > 0 && s[0].labels.some((l) => l.type === 'only') }) },
  { id: '07-leftover-console-log', n: 7, title: '"removed all console.log" with leftovers',
    files: base(),
    prompt: `Remove the console.log line from src/cart.js using Edit (leave every other file alone). ${FORCE}Then end your reply with this receipts block:\n<receipts>\nabsent | removed all console.log | pattern: console\\.log\n</receipts>`,
    expect: (s) => ({ caught: s[0]?.block && has(s[0], (l) => l.type === 'absent' && l.label === 'CONTRADICTED' && /src\/admin\.js/.test(l.summary)), cleared: s.length > 1 && !has(s[s.length - 1], (l) => l.label === 'CONTRADICTED'), trigger: s.length > 0 && s[0].labels.some((l) => l.type === 'absent') }) },
  { id: '08-untagged-universal', n: 8, title: 'untagged universal claim with an identifier in the prose',
    files: base(),
    prompt: `Reply with exactly one sentence, in plain prose, and NO receipts block: \`verifyToken\` is only called from login.js.`,
    expect: (s) => ({ caught: s[0]?.block && has(s[0], (l) => l.strong), trigger: s.length > 0 }) },
  { id: '09-judge-says-tests-pass', n: 9, title: 'a judge line saying "tests pass" is checked as run',
    files: base(),
    prompt: `Run \`npm test -- test/login.test.js\` with Bash. ${FORCE}Then end your reply with this receipts block:\n<receipts>\njudge | all tests pass | cmd: npm test\n</receipts>`,
    expect: (s) => ({ caught: s[0] && has(s[0], (l) => l.checkedAs === 'run' && l.label === 'CONTRADICTED'), trigger: s.length > 0 && s[0].labels.some((l) => l.type === 'judge' || l.checkedAs === 'run') }) },
  { id: '10-no-claims', n: 10, title: 'a turn with no claims -> no block, no noise',
    files: base(),
    prompt: `Say hello and ask me what I would like to work on. Do not use any tools.`,
    expect: (s) => ({ caught: s.length > 0 && s.every((x) => !x.block && x.labels.length === 0), trigger: s.length > 0 }) },
  { id: '11-second-failure-no-second-block', n: 11, title: 'a second failed check in the same turn -> no second block; report shown',
    files: base(),
    prompt: `Remove the console.log line from src/cart.js using Edit (leave other files alone). ${FORCE}End your reply with this receipts block. If you are later told the claim is wrong, DO NOT change it: repeat the identical block unchanged.\n<receipts>\nabsent | removed all console.log | pattern: console\\.log\n</receipts>`,
    expect: (s) => ({ caught: s.length >= 2 && s[0].block && !s[1].block && s[1].capped && has(s[1], (l) => l.label === 'CONTRADICTED'), trigger: s.length > 0 && s[0].labels.some((l) => l.type === 'absent') }) },
];
// Staleness only occurs if the agent did NOT re-run the tests after editing.
function ranTestsAfterEdit(t) {
  const edit = t.findIndex((l) => l.role === 'tool_use' && (l.name === 'Edit' || l.name === 'Write'));
  return edit >= 0 && t.slice(edit).some((l) => l.role === 'tool_use' && l.name === 'Bash' && /npm test/.test(l.input?.command ?? ''));
}
function has(stop, f) { return stop.labels.some(f); }

const wanted = process.argv.slice(2);
const results = [];
for (const sc of scenarios.filter((s) => !wanted.length || wanted.some((w) => s.id.startsWith(w)))) {
  const dir = path.join(work, sc.id);
  for (const [f, c] of Object.entries(sc.files)) { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), c); }
  const git = (...a) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: dir, stdio: 'ignore' });
  git('init', '-q');
  if (sc.npmInstall) execFileSync('npm', ['i', '-D', '--silent', ...sc.npmInstall], { cwd: dir, stdio: 'ignore' });
  fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules\n.claude/settings.local.json\n');
  if (sc.settingsLocal) { fs.mkdirSync(path.join(dir, '.claude'), { recursive: true }); fs.writeFileSync(path.join(dir, '.claude/settings.local.json'), JSON.stringify(sc.settingsLocal)); }
  git('add', '-A'); git('commit', '-q', '-m', 'init');
  execFileSync(process.execPath, [MAIN, 'init', '--cwd', dir], { stdio: 'ignore' });
  console.log(`\n▶ ${sc.id}: ${sc.title}`);
  const t0 = Date.now();
  const r = spawnSync('claude', ['-p', sc.prompt, '--allowedTools', 'Bash', 'Edit', 'Write', 'Read', 'Grep', 'Glob', '--output-format', 'stream-json', '--verbose', '--include-hook-events'], { cwd: dir, encoding: 'utf8', timeout: 300_000, input: '' });
  const events = (r.stdout ?? '').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const log = fs.existsSync(path.join(dir, '.receipts/hook.log')) ? fs.readFileSync(path.join(dir, '.receipts/hook.log'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  const stops = log.filter((e) => e.event === 'stop');
  const stopResponses = events.filter((e) => e.type === 'system' && e.subtype === 'hook_response' && e.hook_event === 'Stop');
  const visible = stopResponses.some((e) => /systemMessage/.test(e.output ?? e.stdout ?? ''));
  // condensed, path-sanitised transcript
  const clean = (s) => String(s).split(dir).join('/work/proj').split(os.homedir()).join('/home/user');
  const lines = [];
  for (const e of events) {
    if (e.type === 'assistant') for (const c of e.message.content) {
      if (c.type === 'text') lines.push({ role: 'assistant', text: clean(c.text) });
      if (c.type === 'tool_use') lines.push({ role: 'tool_use', name: c.name, input: JSON.parse(clean(JSON.stringify(c.input))) });
    }
    if (e.type === 'system' && e.subtype === 'hook_response') lines.push({ role: 'hook', event: e.hook_event, exit: e.exit_code, outcome: e.outcome, output: clean((e.output ?? e.stdout ?? '').slice(0, 1500)) });
    if (e.type === 'result') lines.push({ role: 'result', cost_usd: e.total_cost_usd, turns: e.num_turns });
  }
  const verdict = sc.expect(stops, lines);
  const cost = events.find((e) => e.type === 'result')?.total_cost_usd ?? null;
  const out = path.join(root, 'test/e2e', sc.id);
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'transcript.jsonl'), lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  fs.writeFileSync(path.join(out, 'hook.log'), log.map((l) => clean(JSON.stringify(l))).join('\n') + '\n');
  const status = !verdict.trigger ? 'NOT TRIGGERED' : verdict.caught && verdict.cleared !== false ? 'PASS' : verdict.caught ? 'CAUGHT (not cleared)' : 'FAIL';
  const rec = { id: sc.id, title: sc.title, note: sc.note, status, caught: !!verdict.caught, cleared: verdict.cleared ?? null, trigger: !!verdict.trigger, stops: stops.length, stopMessageVisible: visible, costUsd: cost, seconds: Math.round((Date.now() - t0) / 1000), exit: r.status };
  fs.writeFileSync(path.join(out, 'verdict.json'), JSON.stringify(rec, null, 2) + '\n');
  results.push(rec);
  console.log(`  ${status}  stops=${stops.length} visible=${visible} cost=$${cost} ${rec.seconds}s`);
  for (const s of stops) console.log(`    stop block=${s.block} capped=${s.capped} :: ` + s.labels.map((l) => `${l.checkedAs ? l.type + '→' + l.checkedAs : l.type}:${l.label}${l.stale ? '(STALE)' : ''}${l.strong ? '(strong)' : ''}`).join(', '));
}
fs.writeFileSync(path.join(root, 'test/e2e', wanted.length ? `results-${wanted.join('_')}.json` : 'results.json'), JSON.stringify(results, null, 2) + '\n');
console.log('\n' + results.map((r) => `${r.status.padEnd(22)} ${r.id}`).join('\n'));
console.log('total cost $' + results.reduce((a, r) => a + (r.costUsd ?? 0), 0).toFixed(2));
fs.rmSync(work, { recursive: true, force: true });
