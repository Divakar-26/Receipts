import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkRepo, mkdir, write, JEST_FAIL, JEST_OK } from '../core/testutil.js';
import { AGENTS, Agent, isBlockOutput, entryFromAgent, entryFromCodex, entryFromGemini, entryFromOpenCode, stopInput, sessionOutput, stopOutput, codexShellResult, geminiShellResult, exitFromText } from '../core/index.js';
import { validate, stripAnnotations } from './schema-validate.js';
import { agentHooks, detectAgents, init, uninstall, MARKER, HOOK_FILES } from './init.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..', '..');
const HOOK = path.join(here, 'hook.js');
const FIX = path.join(ROOT, 'test', 'fixtures');
const fixture = (agent: string, name: string) => JSON.parse(fs.readFileSync(path.join(FIX, agent, name), 'utf8'));

const SID = 'contract-session';
const hook = (agent: Agent, kind: string, payload: unknown) =>
  spawnSync(process.execPath, [HOOK, agent, kind], { input: JSON.stringify(payload), encoding: 'utf8' });

/** The ledger payload each agent would send after a shell command. Codex/Gemini/OpenCode shapes are doc-derived. */
function ledgerPayload(agent: Agent, cwd: string, cmd: string, exit: number | null, out: string): unknown {
  switch (agent) {
    case 'claude':
      return exit === 0
        ? { session_id: SID, cwd, hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: cmd }, tool_response: { stdout: out, stderr: '' } }
        : { session_id: SID, cwd, hook_event_name: 'PostToolUseFailure', tool_name: 'Bash', tool_input: { command: cmd }, error: `Exit code ${exit}\n${out}` };
    case 'codex':
      return { session_id: SID, cwd, hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: cmd }, tool_response: `Exit code: ${exit}\nWall time: 0.1 seconds\nOutput:\n${out}` };
    case 'gemini':
      return { session_id: SID, cwd, hook_event_name: 'AfterTool', tool_name: 'run_shell_command', tool_input: { command: cmd }, tool_response: { llmContent: `Output: ${out || '(empty)'}${exit ? `\nExit Code: ${exit}` : ''}\nProcess Group PGID: 4242`, returnDisplay: out } };
    case 'opencode':
      return { session_id: SID, cwd, tool: 'bash', command: cmd, output: out, exit };
  }
}
const stopPayload = (agent: Agent, cwd: string, message: string, active = false): unknown =>
  agent === 'gemini'
    ? { session_id: SID, cwd, hook_event_name: 'AfterAgent', prompt: 'x', prompt_response: message, stop_hook_active: active }
    : { session_id: SID, cwd, hook_event_name: 'Stop', last_assistant_message: message, stop_hook_active: active };
const promptPayload = (agent: Agent, cwd: string): unknown => ({ session_id: SID, cwd, hook_event_name: agent === 'gemini' ? 'BeforeAgent' : 'UserPromptSubmit', prompt: 'x' });

interface StopResult {
  blocked: boolean;
  text: string;
  reason: string;
  raw: string;
}
function session(agent: Agent, files: Record<string, string>) {
  const dir = mkRepo({ '.receipts.json': '{"mode":"block"}', ...files });
  const hooks = {
    dir,
    ledger: (cmd: string, o: { exit?: number; out?: string } = {}) => {
      const r = hook(agent, 'ledger', ledgerPayload(agent, dir, cmd, o.exit ?? 0, o.out ?? ''));
      assert.equal(r.status, 0);
    },
    prompt: () => hook(agent, 'prompt', promptPayload(agent, dir)),
    stop: (message: string, active = false): StopResult => {
      const r = hook(agent, 'stop', stopPayload(agent, dir, message, active));
      assert.equal(r.status, 0, r.stderr);
      const out = r.stdout.trim() ? JSON.parse(r.stdout) : {};
      return { blocked: isBlockOutput(agent, out), text: out.systemMessage ?? '', reason: out.reason ?? '', raw: r.stdout };
    },
  };
  hooks.prompt();
  return hooks;
}

const PKG = JSON.stringify({ name: 'x', scripts: { test: 'jest' } });
const AUTH = 'function verifyToken(t) {\n  return !!t;\n}\nmodule.exports = { verifyToken };\n';
const LOGIN = "const { verifyToken } = require('./auth');\nfunction login(t) {\n  return verifyToken(t);\n}\nmodule.exports = { login };\n";
const block = (...l: string[]) => `Done.\n<receipts>\n${l.join('\n')}\n</receipts>`;

for (const agent of AGENTS) {
  test(`[${agent}] the 11 standard scenarios through the real hook handlers`, () => {
    // 1. false "all tests pass" after a filtered run
    {
      const s = session(agent, { 'package.json': PKG, 'a.js': 'x\n' });
      s.ledger('npm test -- login', { out: JEST_OK });
      const r = s.stop(block('run | all tests pass | cmd: npm test -- login'));
      assert.ok(r.blocked, '1: blocked');
      assert.match(r.text, /only a subset ran/);
    }
    // 2. `npm test | tail -20` with failing tests
    {
      const s = session(agent, { 'package.json': PKG });
      s.ledger('npm test | tail -20', { exit: 0, out: JEST_FAIL });
      const r = s.stop(block('run | all tests pass | cmd: npm test'));
      assert.ok(r.blocked, '2: blocked');
      assert.ok(!r.text.includes('✅'), '2: not accepted as a pass');
    }
    // 3. 0 tests collected
    {
      const s = session(agent, { 'package.json': PKG });
      s.ledger('npm test', { out: '  0 passing (2ms)\n' });
      const r = s.stop(block('run | all tests pass | cmd: npm test'));
      assert.ok(r.blocked && /no tests executed/.test(r.text), '3');
    }
    // 4. passing run, then a code edit -> STALE; a re-run clears it
    {
      const s = session(agent, { 'package.json': PKG, 'src/a.js': 'let a = 1;\n' });
      s.ledger('npm test', { out: JEST_OK });
      assert.equal(s.stop(block('run | all tests pass | cmd: npm test')).blocked, false, '4: fresh run verifies');
      fs.writeFileSync(path.join(s.dir, 'src/a.js'), 'let a = 2;\n');
      s.prompt();
      const stale = s.stop(block('run | all tests pass | cmd: npm test'));
      assert.ok(stale.blocked && /STALE/.test(stale.text), '4: stale blocks');
      s.ledger('npm test', { out: JEST_OK });
      const ok = s.stop(block('run | all tests pass | cmd: npm test'));
      assert.ok(!ok.blocked && /✅/.test(ok.text), '4: re-run clears it');
    }
    // 5. "only called from X" with a second caller elsewhere
    {
      const s = session(agent, { 'src/auth.js': AUTH, 'src/login.js': LOGIN, 'lib/admin/panel.js': "const { verifyToken } = require('../../src/auth');\nexports.open = (t) => verifyToken(t);\n" });
      const r = s.stop(block('only | verifyToken is only called from login | symbol: verifyToken | in: src/login.js'));
      assert.ok(r.blocked && /lib\/admin\/panel\.js:\d/.test(r.reason), '5');
    }
    // 6. symbol only in a comment or string: no false block
    {
      const s = session(agent, { 'src/auth.js': AUTH, 'src/login.js': LOGIN, 'src/n.js': "// verifyToken was here\nconst s = 'verifyToken';\n" });
      assert.equal(s.stop(block('only | verifyToken is only called from login | symbol: verifyToken | in: src/login.js')).blocked, false, '6');
    }
    // 7. "removed all console.log" with leftovers
    {
      const s = session(agent, { 'src/cart.js': 'console.log(1);\n', 'src/admin.js': 'x();\nconsole.log(2);\n' });
      const r = s.stop(block('absent | removed all console.log | pattern: console\\.log'));
      assert.ok(r.blocked && /src\/cart\.js:1/.test(r.reason) && /src\/admin\.js:2/.test(r.reason), '7');
    }
    // 8. untagged universal claim with an identifier
    {
      const s = session(agent, { 'src/auth.js': AUTH });
      assert.ok(s.stop('`verifyToken` is only called from login.js.').blocked, '8');
    }
    // 9. a judge line saying "tests pass" is checked as run
    {
      const s = session(agent, { 'package.json': PKG });
      s.ledger('npm test -- login', { out: JEST_OK });
      const r = s.stop(block('judge | all tests pass'));
      assert.ok(r.blocked && /checked as run/.test(r.text), '9');
    }
    // 10. a turn with no claims: no block, no noise
    {
      const s = session(agent, { 'a.txt': 'a' });
      const r = s.stop('Hello! What would you like to work on?');
      assert.deepEqual([r.blocked, r.raw], [false, ''], '10');
    }
    // 11. a second failed check in the same turn: no second block, report shown
    {
      const s = session(agent, { 'src/cart.js': 'console.log(1);\n' });
      const msg = block('absent | removed all console.log | pattern: console\\.log');
      assert.ok(s.stop(msg).blocked, '11: first blocks');
      const second = s.stop(msg, agent !== 'opencode');
      assert.ok(!second.blocked && /not blocking again/.test(second.text), '11: second does not block');
      s.prompt();
      assert.ok(s.stop(msg).blocked, '11: a new user turn re-arms it');
    }
  });
}

test('session hook: rules injected as model context where the agent has a hook for it', () => {
  for (const agent of AGENTS) {
    const dir = mkdir();
    const r = hook(agent, 'session', { session_id: SID, cwd: dir, hook_event_name: 'SessionStart', source: 'startup' });
    assert.equal(r.status, 0);
    if (agent === 'opencode') assert.equal(r.stdout, '', 'opencode: rules go in AGENTS.md instead');
    else assert.match(JSON.parse(r.stdout).hookSpecificOutput.additionalContext, /no claim without proof/i, agent);
  }
});

test('Gemini uses deny (forces a retry turn); the others use block', () => {
  assert.deepEqual(stopOutput('gemini', { block: true, reason: 'r', text: 't' }), { decision: 'deny', reason: 'r', systemMessage: 't' });
  assert.deepEqual(stopOutput('codex', { block: true, reason: 'r', text: 't' }), { decision: 'block', reason: 'r', systemMessage: 't' });
  assert.deepEqual(stopOutput('claude', { block: false, reason: '', text: 't' }), { systemMessage: 't' });
  assert.equal(isBlockOutput('gemini', { decision: 'deny' }), true);
  assert.equal(isBlockOutput('gemini', { decision: 'block' }), false);
  assert.equal(sessionOutput('opencode', 'rules'), null);
  assert.equal(sessionOutput('codex', ''), null);
  assert.equal(stopInput('gemini', { prompt_response: 'a', session_id: 's', cwd: '/x', stop_hook_active: true }).message, 'a');
  assert.deepEqual(stopInput('codex', {}), { message: '', session: 'unknown', cwd: process.cwd(), stopHookActive: false });
});

test('constructed payload fixtures parse into ledger entries', async () => {
  const c = (await entryFromCodex(fixture('codex', 'PostToolUse.Bash.constructed.json')))!;
  assert.ok(c.kind === 'shell' && c.exit === 0 && c.exit_trusted && c.summary?.passed === 3 && c.agent === 'codex');
  const noExit = (await entryFromCodex(fixture('codex', 'PostToolUse.Bash.object-no-exit.constructed.json')))!;
  assert.ok(noExit.kind === 'shell' && noExit.exit === null && !noExit.exit_trusted && noExit.summary?.passed === 3, 'no exit code: the summary is the evidence');
  const g = (await entryFromGemini(fixture('gemini', 'AfterTool.run_shell_command.constructed.json')))!;
  assert.ok(g.kind === 'shell' && g.exit === 0 && g.exit_trusted && g.summary?.passed === 3 && g.agent === 'gemini-cli');
  const gf = (await entryFromGemini(fixture('gemini', 'AfterTool.run_shell_command.failed.constructed.json')))!;
  assert.ok(gf.kind === 'shell' && gf.exit === 1 && gf.summary?.failed === 2);
  const o = (await entryFromOpenCode(fixture('opencode', 'ledger.constructed.json')))!;
  assert.ok(o.kind === 'shell' && o.exit === null && !o.exit_trusted && o.agent === 'opencode');
  assert.equal(await entryFromCodex(fixture('codex', 'Stop.constructed.json')), null);
  assert.equal(await entryFromGemini(fixture('gemini', 'AfterAgent.constructed.json')), null);
  assert.equal(await entryFromOpenCode({ session_id: 's' }), null);
  assert.equal(await entryFromOpenCode(null), null);
  assert.equal(await entryFromAgent('claude', {}), null);
  for (const [agent, name] of [['codex', 'SessionStart'], ['gemini', 'SessionStart'], ['gemini', 'BeforeAgent'], ['codex', 'UserPromptSubmit']] as const) {
    assert.ok(fixture(agent, `${name}.constructed.json`).session_id, `${agent}/${name}`);
  }
});

test('tool payload edge cases', async () => {
  assert.equal(await entryFromCodex({ session_id: 's', hook_event_name: 'PostToolUse', tool_name: 'apply_patch', tool_input: { command: 'x' } }), null);
  assert.equal(await entryFromCodex({ session_id: 's', hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: {} }), null);
  assert.equal(await entryFromCodex(null), null);
  const web = (await entryFromGemini({ session_id: 's', hook_event_name: 'AfterTool', tool_name: 'web_fetch', tool_input: { prompt: 'summarise https://example.com/docs please' } }))!;
  assert.deepEqual([web.kind, (web as { url: string }).url], ['web', 'https://example.com/docs']);
  assert.equal(await entryFromGemini({ session_id: 's', hook_event_name: 'AfterTool', tool_name: 'web_fetch', tool_input: { prompt: 'no url' } }), null);
  assert.equal(await entryFromGemini({ session_id: 's', hook_event_name: 'AfterTool', tool_name: 'read_file', tool_input: {} }), null);
  const ow = (await entryFromOpenCode({ session_id: 's', url: 'https://x.dev' }))!;
  assert.equal(ow.kind, 'web');
  assert.deepEqual(codexShellResult({ stdout: 'a', stderr: 'b', exit_code: 3 }), { exit: 3, output: 'a\nb' });
  assert.deepEqual(codexShellResult({ metadata: { exitCode: 1 }, content: 'c' }), { exit: 1, output: 'c' });
  assert.deepEqual(codexShellResult(7), { exit: null, output: '' });
  assert.equal(codexShellResult({ output: 'Exit code: 4\nx' }).exit, 4);
  // layout from the Gemini CLI 0.70.0 shell tool: Exit Code only when non-zero
  assert.deepEqual(geminiShellResult({ llmContent: 'Output: hi\nProcess Group PGID: 9' }), { exit: 0, output: 'hi' });
  assert.deepEqual(geminiShellResult({ llmContent: 'Output: a\nExit Code: 3: not a real line\nb\nExit Code: 3\nProcess Group PGID: 9' }), { exit: 3, output: 'a\nExit Code: 3: not a real line\nb' });
  assert.deepEqual(geminiShellResult({ llmContent: 'Output: (empty)' }), { exit: 0, output: '' });
  assert.equal(geminiShellResult({ llmContent: 'Output: x\nError: spawn failed\nProcess Group PGID: 9' }).exit, null);
  assert.equal(geminiShellResult({ llmContent: 'Output: x\nSignal: SIGKILL' }).exit, null);
  assert.equal(geminiShellResult({ llmContent: 'Command moved to background (PID: 5). Output hidden. Press Ctrl+B to view.' }).exit, null);
  assert.equal(geminiShellResult({ llmContent: 'Command was cancelled by user before it could complete. There was no output before it was cancelled.' }).exit, null);
  assert.deepEqual(geminiShellResult({ llmContent: [{ text: 'Exit Code: 2' }], returnDisplay: '' }), { exit: 2, output: 'Exit Code: 2' });
  assert.deepEqual(geminiShellResult({ returnDisplay: 'shown', error: { message: 'boom' } }), { exit: null, output: 'shown' });
  assert.deepEqual(geminiShellResult(null), { exit: null, output: '' });
  assert.equal(exitFromText('process exited with code 9'), 9);
  assert.equal(exitFromText('nothing'), null);
});

test('init/uninstall for every agent: reversible, merges, idempotent', () => {
  const before = JSON.stringify({ model: 'x', hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo mine' }] }] } });
  const dir = mkRepo({ 'package.json': PKG, '.gitignore': 'node_modules\n', '.claude/settings.json': before, 'AGENTS.md': '# My agents file\n\nKeep tests green.\n' });
  const dry = init({ cwd: dir, agents: [...AGENTS], dryRun: true });
  assert.ok(dry.length > 6);
  assert.equal(fs.existsSync(path.join(dir, '.codex')), false, 'dry run writes nothing');

  const lines = init({ cwd: dir, agents: [...AGENTS] });
  assert.ok(lines.some((l) => l.includes('/hooks')), 'codex trust step is printed');
  for (const a of ['claude', 'codex', 'gemini'] as const) {
    const s = JSON.parse(fs.readFileSync(path.join(dir, HOOK_FILES[a]), 'utf8'));
    assert.ok(JSON.stringify(s).includes(MARKER), a);
  }
  const codex = JSON.parse(fs.readFileSync(path.join(dir, '.codex/hooks.json'), 'utf8')).hooks;
  assert.equal(codex.PostToolUse[0].matcher, '^Bash$');
  assert.match(codex.Stop[0].hooks[0].command, /^node ".*hook\.js" codex stop --receipts$/);
  const gemini = JSON.parse(fs.readFileSync(path.join(dir, '.gemini/settings.json'), 'utf8')).hooks;
  assert.deepEqual(Object.keys(gemini).sort(), ['AfterAgent', 'AfterTool', 'BeforeAgent', 'SessionStart']);
  assert.equal(gemini.AfterAgent[0].hooks[0].timeout, 15000);
  const plugin = fs.readFileSync(path.join(dir, '.opencode/plugins/receipts.js'), 'utf8');
  assert.ok(plugin.startsWith('// receipts:managed') && !plugin.includes('__RECEIPTS_HOOK__'));
  const agentsMd = fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8');
  assert.ok(agentsMd.startsWith('# My agents file') && agentsMd.includes('<!-- receipts:start -->') && agentsMd.includes('no claim without proof'));

  init({ cwd: dir, agents: [...AGENTS] });
  assert.equal(fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8').split('receipts:start').length - 1, 1, 'AGENTS.md block is not duplicated');
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, '.claude/settings.json'), 'utf8')).hooks.Stop.length, 2);

  uninstall({ cwd: dir });
  for (const f of ['.codex', '.gemini', '.opencode', '.receipts', '.receipts.json']) assert.equal(fs.existsSync(path.join(dir, f)), false, f);
  assert.equal(JSON.stringify(JSON.parse(fs.readFileSync(path.join(dir, '.claude/settings.json'), 'utf8'))), before);
  assert.equal(fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8'), '# My agents file\n\nKeep tests green.\n');
  assert.equal(fs.readFileSync(path.join(dir, '.gitignore'), 'utf8'), 'node_modules\n');
});

test('init creates AGENTS.md when absent and removes it again; node_modules paths are project-relative', () => {
  const dir = mkdir();
  init({ cwd: dir, agents: ['opencode'] });
  assert.ok(fs.existsSync(path.join(dir, 'AGENTS.md')));
  uninstall({ cwd: dir });
  assert.equal(fs.existsSync(path.join(dir, 'AGENTS.md')), false);
  const p = path.join(dir, 'node_modules', '@receipts', 'cli', 'dist', 'cli', 'hook.js');
  assert.equal(agentHooks('gemini', dir, p).AfterAgent[0].hooks[0].command, 'node "$GEMINI_PROJECT_DIR/node_modules/@receipts/cli/dist/cli/hook.js" gemini stop --receipts');
  assert.equal((agentHooks('claude', dir, p).Stop[0].hooks[0].args as string[])[0], '${CLAUDE_PROJECT_DIR}/node_modules/@receipts/cli/dist/cli/hook.js');
  const bad = mkdir();
  write(bad, { '.codex/hooks.json': '{ nope' });
  assert.throws(() => init({ cwd: bad, agents: ['codex'] }), /not valid JSON/);
});

test('detectAgents finds CLIs on PATH', () => {
  const bin = mkdir();
  for (const n of ['codex', 'opencode']) fs.writeFileSync(path.join(bin, n), '#!/bin/sh\n', { mode: 0o755 });
  assert.deepEqual(detectAgents({ PATH: bin }), ['codex', 'opencode']);
  assert.deepEqual(detectAgents({ PATH: '' }), []);
});

test('CLI: init --agent', () => {
  const dir = mkdir();
  const run = (...a: string[]) => spawnSync(process.execPath, [path.join(here, 'main.js'), ...a], { encoding: 'utf8' });
  const r = run('init', '--cwd', dir, '--agent', 'codex,gemini');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /\.codex\/hooks\.json/);
  assert.match(r.stdout, /\.gemini\/settings\.json/);
  assert.equal(fs.existsSync(path.join(dir, '.claude')), false);
  assert.equal(run('init', '--cwd', dir, '--agent', 'nope').status, 1);
  assert.equal(run('init', '--cwd', mkdir(), '--agent', 'all').status, 0);
  const auto = run('init', '--cwd', mkdir());
  assert.match(auto.stdout, /detected on PATH|no agent CLI found/);
  assert.equal(run('uninstall', '--cwd', dir).status, 0);
});

const schema = (name: string) => JSON.parse(fs.readFileSync(path.join(FIX, 'codex', 'schemas', `${name}.schema.json`), 'utf8'));

test('codex: fixtures conform to the input schemas extracted from codex 0.171.0', () => {
  const pairs: [string, string][] = [
    ['SessionStart.constructed.json', 'session-start.command.input'],
    ['UserPromptSubmit.constructed.json', 'user-prompt-submit.command.input'],
    ['PostToolUse.Bash.constructed.json', 'post-tool-use.command.input'],
    ['PostToolUse.Bash.object-no-exit.constructed.json', 'post-tool-use.command.input'],
    ['Stop.constructed.json', 'stop.command.input'],
  ];
  for (const [file, name] of pairs) assert.deepEqual(validate(schema(name), stripAnnotations(fixture('codex', file))), [], file);
  // the validator itself rejects bad payloads
  assert.ok(validate(schema('stop.command.input'), { cwd: 'x' }).length > 3);
  assert.ok(validate(schema('stop.command.output'), { decision: 'allow' }).length > 0);
  assert.ok(validate(schema('stop.command.output'), { nope: 1 }).length > 0);
});

test('codex: what our hooks print conforms to the output schemas extracted from codex 0.171.0', () => {
  const dir = mkRepo({ '.receipts.json': '{"mode":"block"}', 'src/cart.js': 'console.log(1);\n' });
  const stopFix = stripAnnotations(fixture('codex', 'Stop.constructed.json'));
  const base = { ...stopFix, cwd: dir };
  const blocked = JSON.parse(hook('codex', 'stop', { ...base, last_assistant_message: block('absent | removed all console.log | pattern: console\\.log') }).stdout);
  assert.equal(blocked.decision, 'block');
  assert.deepEqual(validate(schema('stop.command.output'), blocked), [], 'block output');
  const report = JSON.parse(hook('codex', 'stop', { ...base, last_assistant_message: block('absent | no zzz | pattern: zzz') }).stdout);
  assert.deepEqual(validate(schema('stop.command.output'), report), [], 'report output');
  const ss = JSON.parse(hook('codex', 'session', { ...stripAnnotations(fixture('codex', 'SessionStart.constructed.json')), cwd: dir }).stdout);
  assert.deepEqual(validate(schema('session-start.command.output'), ss), [], 'session-start output');
  // a null last_assistant_message (allowed by the schema) is handled quietly
  const nullMsg = hook('codex', 'stop', { ...base, last_assistant_message: null });
  assert.equal(nullMsg.status, 0);
  assert.equal(nullMsg.stdout, '');
  // the prompt hook prints nothing, which every output schema accepts
  assert.equal(hook('codex', 'prompt', { ...stripAnnotations(fixture('codex', 'UserPromptSubmit.constructed.json')), cwd: dir }).stdout, '');
});
