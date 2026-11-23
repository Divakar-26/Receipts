import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkRepo, mkdir, write } from '../core/testutil.js';
import { readLedger, ledgerPath } from '../core/ledger.js';
import { init, uninstall, claudeHooks, MARKER } from './init.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..', '..');
const HOOK = path.join(here, 'hook.js');
const MAIN = path.join(here, 'main.js');
const FIX = path.join(ROOT, 'test', 'fixtures', 'claude-code');
const hook = (kind: string, payload: unknown) => spawnSync(process.execPath, [HOOK, 'claude', kind], { input: typeof payload === 'string' ? payload : JSON.stringify(payload), encoding: 'utf8' });
const fixture = (n: string) => JSON.parse(fs.readFileSync(path.join(FIX, n), 'utf8'));

test('adapter files: rules <= 15 lines, skill < 150 lines, plugin copy in sync, manifests parse', () => {
  const rules = fs.readFileSync(path.join(ROOT, 'rules', 'RULES.md'), 'utf8').trimEnd().split('\n');
  assert.ok(rules.length <= 15, `RULES.md has ${rules.length} lines`);
  const skill = fs.readFileSync(path.join(ROOT, 'skill', 'SKILL.md'), 'utf8');
  assert.ok(skill.trimEnd().split('\n').length < 150);
  for (const t of ['code', 'run', 'absent', 'only', 'change', 'dep', 'judge']) assert.ok(skill.includes(`\`${t}\``), t);
  assert.equal((skill.match(/^## (Good|Bad) examples/gm) ?? []).length, 2);
  assert.equal(fs.readFileSync(path.join(ROOT, 'adapters/claude-code/skills/receipts/SKILL.md'), 'utf8'), skill);
  const plugin = JSON.parse(fs.readFileSync(path.join(ROOT, 'adapters/claude-code/.claude-plugin/plugin.json'), 'utf8'));
  assert.equal(plugin.name, 'receipts');
  const hooks = JSON.parse(fs.readFileSync(path.join(ROOT, 'adapters/claude-code/hooks/hooks.json'), 'utf8')).hooks;
  assert.deepEqual(Object.keys(hooks).sort(), ['PostToolUse', 'PostToolUseFailure', 'SessionStart', 'Stop', 'UserPromptSubmit']);
  assert.equal(hooks.PostToolUse[0].matcher, 'Bash|WebFetch');
  assert.deepEqual(Object.keys(claudeHooks('/x')).sort(), Object.keys(hooks).sort());
  JSON.parse(fs.readFileSync(path.join(ROOT, '.claude-plugin/marketplace.json'), 'utf8'));
});

test('codex / gemini / opencode adapter files are in sync with the sources', () => {
  const skill = fs.readFileSync(path.join(ROOT, 'skill', 'SKILL.md'), 'utf8');
  const rules = fs.readFileSync(path.join(ROOT, 'rules', 'RULES.md'), 'utf8');
  for (const a of ['codex', 'gemini']) assert.equal(fs.readFileSync(path.join(ROOT, 'adapters', a, 'skills/receipts/SKILL.md'), 'utf8'), skill, a);
  assert.equal(fs.readFileSync(path.join(ROOT, 'adapters/gemini/GEMINI.md'), 'utf8'), rules);
  const gem = JSON.parse(fs.readFileSync(path.join(ROOT, 'adapters/gemini/gemini-extension.json'), 'utf8'));
  assert.equal(gem.contextFileName, 'GEMINI.md');
  assert.equal(gem.hooks, undefined, 'Gemini extension hooks live in hooks/hooks.json, not the manifest');
  const gh = JSON.parse(fs.readFileSync(path.join(ROOT, 'adapters/gemini/hooks/hooks.json'), 'utf8')).hooks;
  assert.deepEqual(Object.keys(gh).sort(), ['AfterAgent', 'AfterTool', 'BeforeAgent', 'SessionStart']);
  const cm = JSON.parse(fs.readFileSync(path.join(ROOT, 'adapters/codex/.codex-plugin/plugin.json'), 'utf8'));
  assert.equal(cm.hooks, './hooks/hooks.json');
  const ch = JSON.parse(fs.readFileSync(path.join(ROOT, 'adapters/codex/hooks/hooks.json'), 'utf8')).hooks;
  assert.deepEqual(Object.keys(ch).sort(), ['PostToolUse', 'SessionStart', 'Stop', 'UserPromptSubmit']);
  for (const h of [...Object.values(gh), ...Object.values(ch)].flat().flatMap((e: any) => e.hooks)) assert.match(h.command, /^receipts-hook (codex|gemini) (ledger|session|prompt|stop)$/);
  assert.ok(fs.readFileSync(path.join(ROOT, 'adapters/opencode/receipts.js'), 'utf8').startsWith('// receipts:managed'));
});

test('session hook injects the rules, resets state; prompt hook resets the retry counter', () => {
  const dir = mkdir();
  const s = hook('session', { ...fixture('SessionStart.startup.json'), cwd: dir });
  assert.equal(s.status, 0);
  const out = JSON.parse(s.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.match(out.hookSpecificOutput.additionalContext, /no claim without proof/i);
  const sid = fixture('SessionStart.startup.json').session_id;
  const stateFile = path.join(dir, '.receipts', 'state.json');
  fs.writeFileSync(stateFile, JSON.stringify({ currentSession: sid, sessions: { [sid]: { blocks: 1 } } }));
  const p = hook('prompt', { ...fixture('UserPromptSubmit.json'), cwd: dir });
  assert.equal(p.status, 0);
  assert.equal(p.stdout, '');
  assert.equal(JSON.parse(fs.readFileSync(stateFile, 'utf8')).sessions[sid].blocks, 0);
  assert.equal(hook('session', 'garbage').status, 0);
  assert.equal(hook('stop', 'garbage').status, 0);
});

test('stop hook: blocks once with a JSON decision, then reports without blocking', () => {
  const dir = mkRepo({ '.receipts.json': '{"mode":"block"}', 'src/cart.js': 'console.log(1);\n' });
  const payload = { ...fixture('Stop.json'), cwd: dir, last_assistant_message: 'Done.\n<receipts>\nabsent | removed all console.log | pattern: console\\.log\n</receipts>' };
  const first = hook('stop', payload);
  assert.equal(first.status, 0);
  const j = JSON.parse(first.stdout);
  assert.equal(j.decision, 'block');
  assert.match(j.reason, /src\/cart\.js:1/);
  assert.match(j.reason, /Format reminder/);
  assert.match(j.systemMessage, /🧾 Receipts/);
  // the platform marks the retry with stop_hook_active; and our own counter also caps it
  const second = JSON.parse(hook('stop', { ...payload, stop_hook_active: true }).stdout);
  assert.equal(second.decision, undefined);
  assert.match(second.systemMessage, /not blocking again/);
  const third = JSON.parse(hook('stop', payload).stdout);
  assert.equal(third.decision, undefined, 'own counter caps a second block even without stop_hook_active');
  assert.match(fs.readFileSync(path.join(dir, '.receipts', 'last-report.md'), 'utf8'), /Receipts/);
  const log = fs.readFileSync(path.join(dir, '.receipts', 'hook.log'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(log.map((e) => e.block), [true, false, false]);
  // a new user turn re-arms the block
  hook('prompt', { ...fixture('UserPromptSubmit.json'), cwd: dir });
  assert.equal(JSON.parse(hook('stop', payload).stdout).decision, 'block');
});

test('stop hook: no claims -> silent; claims but fine -> systemMessage only', () => {
  const dir = mkRepo({ 'a.js': 'x\n' });
  const quiet = hook('stop', { ...fixture('Stop.json'), cwd: dir, last_assistant_message: 'Hello! What would you like to do?' });
  assert.equal(quiet.stdout, '');
  const empty = hook('stop', { ...fixture('Stop.json'), cwd: dir, last_assistant_message: '' });
  assert.equal(empty.stdout, '');
  const ok = JSON.parse(hook('stop', { ...fixture('Stop.json'), cwd: dir, last_assistant_message: '<receipts>\nabsent | no zzz | pattern: zzz\n</receipts>' }).stdout);
  assert.equal(ok.decision, undefined);
  assert.match(ok.systemMessage, /1 verified/);
});

test('dispatcher: ledger kind appends; unknown kind prints usage', () => {
  const dir = mkdir();
  const r = hook('ledger', { ...fixture('PostToolUse.Bash.json'), cwd: dir });
  assert.equal(r.status, 0);
  assert.equal(readLedger(ledgerPath(dir)).length, 1);
  assert.equal(hook('bogus', {}).status, 64);
});

test('init / uninstall: reversible, merges existing settings, idempotent', () => {
  const dir = mkRepo({ 'package.json': '{"scripts":{"test":"jest","build":"tsc"}}', '.gitignore': 'node_modules\n', '.claude/settings.json': JSON.stringify({ model: 'x', hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo mine' }] }], PostToolUse: [{ matcher: 'Edit', hooks: [{ type: 'command', command: 'fmt' }] }] } }) });
  const before = fs.readFileSync(path.join(dir, '.claude/settings.json'), 'utf8');
  const dry = init({ cwd: dir, dryRun: true });
  assert.ok(dry.length >= 4);
  assert.equal(fs.existsSync(path.join(dir, '.receipts.json')), false, 'dry run writes nothing');

  const lines = init({ cwd: dir });
  assert.ok(lines.some((l) => l.includes('created .receipts.json')));
  const cfg = JSON.parse(fs.readFileSync(path.join(dir, '.receipts.json'), 'utf8'));
  assert.deepEqual([cfg.mode, cfg.testCommand, cfg.buildCommand], ['warn', 'npm test', 'npm run build']);
  assert.match(fs.readFileSync(path.join(dir, '.gitignore'), 'utf8'), /^\.receipts\/$/m);
  const s = JSON.parse(fs.readFileSync(path.join(dir, '.claude/settings.json'), 'utf8'));
  assert.equal(s.model, 'x');
  assert.equal(s.hooks.Stop.length, 2, 'existing Stop hook kept');
  assert.equal(s.hooks.PostToolUse.length, 2);
  assert.ok(fs.existsSync(path.join(dir, '.claude/skills/receipts/SKILL.md')));

  const again = init({ cwd: dir });
  assert.ok(again.some((l) => l.includes('kept existing')));
  const s2 = JSON.parse(fs.readFileSync(path.join(dir, '.claude/settings.json'), 'utf8'));
  assert.equal(s2.hooks.Stop.length, 2, 'idempotent: no duplicate hooks');
  assert.equal(JSON.stringify(s2).split(MARKER).length - 1, 5);

  write(dir, { '.receipts/ledger.jsonl': '{}\n' });
  const gone = uninstall({ cwd: dir });
  assert.ok(gone.some((l) => l.includes('Receipts hook')));
  assert.equal(fs.existsSync(path.join(dir, '.receipts')), false);
  assert.equal(fs.existsSync(path.join(dir, '.receipts.json')), false);
  assert.equal(fs.existsSync(path.join(dir, '.claude/skills')), false);
  assert.equal(JSON.stringify(JSON.parse(fs.readFileSync(path.join(dir, '.claude/settings.json'), 'utf8'))), JSON.stringify(JSON.parse(before)), 'settings restored to the original');
  assert.equal(fs.readFileSync(path.join(dir, '.gitignore'), 'utf8'), 'node_modules\n');
  assert.deepEqual(uninstall({ cwd: dir }), ['nothing to remove']);
});

test('init on a bare folder creates everything and uninstall removes it all', () => {
  const dir = mkdir();
  init({ cwd: dir });
  for (const f of ['.receipts.json', '.gitignore', '.claude/settings.json', '.claude/skills/receipts/SKILL.md']) assert.ok(fs.existsSync(path.join(dir, f)), f);
  const kept = uninstall({ cwd: dir, keepData: true });
  assert.ok(kept.some((l) => l.includes('removed .claude/settings.json')));
  assert.deepEqual(fs.readdirSync(dir).sort(), ['.receipts']);
  const bad = mkdir();
  write(bad, { '.claude/settings.json': '{ nope' });
  assert.throws(() => init({ cwd: bad }), /not valid JSON/);
});

test('init: node_modules installs get a project-relative hook path; npx cache path warns', () => {
  const dir = mkdir();
  const lines = init({ cwd: dir, hookJs: path.join(dir, 'node_modules', '@receipts', 'cli', 'dist', 'cli', 'hook.js') });
  const s = JSON.parse(fs.readFileSync(path.join(dir, '.claude/settings.json'), 'utf8'));
  assert.equal(s.hooks.Stop[0].hooks[0].args[0], '${CLAUDE_PROJECT_DIR}/node_modules/@receipts/cli/dist/cli/hook.js');
  assert.ok(!lines.some((l) => l.startsWith('WARNING')));
  const npx = mkdir();
  assert.ok(init({ cwd: npx, hookJs: '/home/u/.npm/_npx/abc/node_modules/@receipts/cli/dist/cli/hook.js' }).some((l) => l.startsWith('WARNING')));
});

test('CLI: init and uninstall commands', () => {
  const dir = mkdir();
  const a = spawnSync(process.execPath, [MAIN, 'init', '--cwd', dir], { encoding: 'utf8' });
  assert.equal(a.status, 0);
  assert.match(a.stdout, /• created \.receipts\.json/);
  const dry = spawnSync(process.execPath, [MAIN, 'init', '--cwd', dir, '--dry-run'], { encoding: 'utf8' });
  assert.match(dry.stdout, /\[dry run\]/);
  const b = spawnSync(process.execPath, [MAIN, 'uninstall', '--cwd', dir], { encoding: 'utf8' });
  assert.equal(b.status, 0);
  assert.match(b.stdout, /removed/);
  const bad = mkdir();
  write(bad, { '.claude/settings.json': 'nope' });
  assert.equal(spawnSync(process.execPath, [MAIN, 'init', '--cwd', bad], { encoding: 'utf8' }).status, 1);
});
