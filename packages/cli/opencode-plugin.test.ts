import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkRepo, mkdir } from '../core/testutil.js';
import { readLedger, ledgerPath } from '../core/ledger.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..', '..');
const HOOK = path.join(here, 'hook.js');

/**
 * Loads adapters/opencode/receipts.js with a stubbed `Plugin.define` and a mock context shaped like
 * @opencode/plugin 2.3.2's `Context`. This checks OUR logic against the published types; it does
 * NOT prove OpenCode calls the hooks this way (no live OpenCode session has run it).
 */
async function loadPlugin(cwd: string) {
  const src = fs
    .readFileSync(path.join(ROOT, 'adapters', 'opencode', 'receipts.js'), 'utf8')
        .replace('"__RECEIPTS_HOOK__"', JSON.stringify(HOOK));
  const file = path.join(mkdir(), 'receipts.mjs');
  fs.writeFileSync(file, src);
  const plugin = (await import(pathToFileURL(file).href)).default;
  const hooks: Record<string, (e: any) => Promise<void> | void> = {};
  const synthetic: any[] = [];
  let messages: any[] = [];
  const ctx = {
    location: { directory: cwd },
    tool: { hook: async (n: string, cb: any) => ((hooks['tool.' + n] = cb), { dispose: async () => {} }) },
    session: {
      hook: async (n: string, cb: any) => ((hooks['session.' + n] = cb), { dispose: async () => {} }),
      context: async () => messages,
      synthetic: async (i: any) => void synthetic.push(i),
    },
  };
  await plugin.setup(ctx);
  return { hooks, synthetic, setMessages: (m: any[]) => (messages = m), plugin };
}
const assistant = (text: string) => ({ type: 'assistant', content: [{ type: 'reasoning', text: 'hmm' }, { type: 'text', text }] });

test('opencode plugin: registers the three hooks', async () => {
  const p = await loadPlugin(mkdir());
  assert.equal(p.plugin.id, 'receipts');
  assert.deepEqual(Object.keys(p.hooks).sort(), ['session.experimental.idle', 'session.prompt', 'tool.execute.after']);
});

test('opencode plugin: bash tool calls reach the ledger; other tools do not', async () => {
  const dir = mkRepo({ 'package.json': '{"scripts":{"test":"jest"}}' });
  const p = await loadPlugin(dir);
  await p.hooks['tool.execute.after']({ tool: 'bash', sessionID: 's1', status: 'completed', input: { command: 'npm test' }, result: { content: [{ type: 'text', text: 'Tests:       3 passed, 3 total\n' }], metadata: { exit: 0 } } });
  await p.hooks['tool.execute.after']({ tool: 'bash', sessionID: 's1', status: 'error', input: { command: 'false' }, error: { message: 'failed', metadata: {} } });
  await p.hooks['tool.execute.after']({ tool: 'read', sessionID: 's1', status: 'completed', input: { path: 'x' }, result: { content: [] } });
  await p.hooks['tool.execute.after']({ tool: 'bash', sessionID: 's1', status: 'completed', input: {}, result: {} });
  const entries = readLedger(ledgerPath(dir));
  assert.equal(entries.length, 2);
  const [a, b] = entries;
  assert.ok(a.kind === 'shell' && a.cmd === 'npm test' && a.exit === 0 && a.summary?.passed === 3 && a.agent === 'opencode');
  assert.ok(b.kind === 'shell' && b.exit === null && !b.exit_trusted, 'no exit-code field documented: unknown, not guessed');
});

test('opencode plugin: idle hook admits a synthetic message when the check fails, once per turn', async () => {
  const dir = mkRepo({ '.receipts.json': '{"mode":"block"}', 'src/cart.js': 'console.log(1);\n' });
  const p = await loadPlugin(dir);
  const msg = 'Done.\n<receipts>\nabsent | removed all console.log | pattern: console\\.log\n</receipts>';
  p.setMessages([{ type: 'user', content: [] }, assistant(msg)]);
  await p.hooks['session.prompt']({ sessionID: 's1', messageID: 'm1', prompt: {} });
  await p.hooks['session.experimental.idle']({ sessionID: 's1', background: [] });
  assert.equal(p.synthetic.length, 1);
  assert.match(p.synthetic[0].text, /src\/cart\.js:1/);
  assert.equal(p.synthetic[0].sessionID, 's1');
  // the retry ends in the same bad claim: report only, no second synthetic message
  await p.hooks['session.experimental.idle']({ sessionID: 's1', background: [] });
  assert.equal(p.synthetic.length, 1);
  // a new user prompt re-arms it
  await p.hooks['session.prompt']({ sessionID: 's1', messageID: 'm2', prompt: {} });
  await p.hooks['session.experimental.idle']({ sessionID: 's1', background: [] });
  assert.equal(p.synthetic.length, 2);
  assert.match(fs.readFileSync(path.join(dir, '.receipts', 'last-report.md'), 'utf8'), /Receipts/);
});

test('opencode plugin: idle hook is quiet for clean turns, empty turns and errors', async () => {
  const dir = mkRepo({ 'a.js': 'x\n' });
  const p = await loadPlugin(dir);
  p.setMessages([assistant('Hello!')]);
  await p.hooks['session.experimental.idle']({ sessionID: 's2', background: [] });
  p.setMessages([{ type: 'assistant', content: [{ type: 'reasoning', text: 'only thoughts' }] }]);
  await p.hooks['session.experimental.idle']({ sessionID: 's2', background: [] });
  p.setMessages([]);
  await p.hooks['session.experimental.idle']({ sessionID: 's2', background: [] });
  assert.equal(p.synthetic.length, 0);
  const broken = await loadPlugin(dir);
  await broken.hooks['session.experimental.idle']({ sessionID: 's3' }); // context() returns [] and must not throw
  assert.equal(broken.synthetic.length, 0);
});
