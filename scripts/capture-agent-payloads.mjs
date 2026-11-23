// Sets up a scratch project that records the REAL hook payloads of an agent, so the
// constructed fixtures in test/fixtures/<agent>/ can be replaced by captured ones.
//
//   node scripts/capture-agent-payloads.mjs setup   <gemini|codex|opencode> [dir]
//   node scripts/capture-agent-payloads.mjs collect <gemini|codex|opencode> <dir>
//
// `setup` writes the capture hooks/plugin and PRINTS the commands for you to run yourself.
// It never starts an agent: workspace trust, hook approval and credentials stay your decision.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const [mode, agent, dirArg] = process.argv.slice(2);
const AGENTS = ['gemini', 'codex', 'opencode'];
if (!['setup', 'collect'].includes(mode) || !AGENTS.includes(agent)) {
  console.error('usage: node scripts/capture-agent-payloads.mjs <setup|collect> <gemini|codex|opencode> [dir]');
  process.exit(64);
}
const dir = path.resolve(dirArg ?? path.join(os.tmpdir(), `receipts-capture-${agent}`));
const out = path.join(dir, 'out');

const CAPTURE_JS = `// Logs each hook's stdin to ${out}/<event>.<ts>.json, then allows everything.
let d = '';
process.stdin.on('data', (c) => (d += c)).on('end', () => {
  const fs = require('fs');
  let j;
  try { j = JSON.parse(d); } catch { j = { raw: d }; }
  fs.mkdirSync(${JSON.stringify(out)}, { recursive: true });
  const name = (j.hook_event_name || 'unknown') + (j.tool_name ? '.' + j.tool_name : '') + (j.source ? '.' + j.source : '');
  fs.writeFileSync(${JSON.stringify(out)} + '/' + name + '.' + Date.now() + '.json', JSON.stringify(j, null, 2));
  process.stdout.write('{}');
});
`;

if (mode === 'setup') {
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(dir, 'capture.js'), CAPTURE_JS);
  const cmd = `node ${JSON.stringify(path.join(dir, 'capture.js'))}`;
  const entry = (timeout, matcher) => [{ ...(matcher ? { matcher } : {}), hooks: [{ type: 'command', command: cmd, timeout }] }];
  if (agent === 'gemini') {
    fs.mkdirSync(path.join(dir, '.gemini'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, '.gemini', 'settings.json'),
      JSON.stringify({ hooks: { SessionStart: entry(10000), BeforeAgent: entry(10000), AfterTool: entry(10000, 'run_shell_command|web_fetch'), AfterAgent: entry(10000) } }, null, 2),
    );
    console.log(`Run these yourself (Gemini asks you to trust the folder; that is your call):\n  cd ${dir}\n  gemini      # interactive: trust the folder, then ask: "Run echo hi with the shell tool, then say ok"\n  # or headless, once you have decided to trust this scratch folder:\n  gemini -p "Run echo hi with the shell tool, then say ok" --output-format json`);
  } else if (agent === 'codex') {
    fs.mkdirSync(path.join(dir, '.codex'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, '.codex', 'hooks.json'),
      JSON.stringify({ hooks: { SessionStart: entry(10), UserPromptSubmit: entry(10), PostToolUse: entry(10, '^Bash$'), Stop: entry(10) } }, null, 2),
    );
    console.log(`Run these yourself (Codex requires you to review and trust the hooks with /hooks):\n  cd ${dir} && git init\n  codex       # run /hooks and trust the hooks, then ask: "Run echo hi in the shell, then say ok"`);
  } else {
    fs.mkdirSync(path.join(dir, '.opencode', 'plugins'), { recursive: true });
    const plugin = `import { Plugin } from "@opencode/plugin"
import fs from "node:fs"
const out = ${JSON.stringify(out)}
fs.mkdirSync(out, { recursive: true })
const safe = (v) => { const seen = new WeakSet(); return JSON.stringify(v, (k, x) => typeof x === "object" && x ? (seen.has(x) ? "[circ]" : (seen.add(x), x)) : typeof x === "function" ? "[fn]" : typeof x === "bigint" ? String(x) : x, 2) }
const log = (k, v) => fs.writeFileSync(out + "/" + k + "." + Date.now() + ".json", safe(v))
export default Plugin.define({
  id: "capture",
  async setup(ctx) {
    log("setup", { keys: Object.keys(ctx), location: ctx.location })
    await ctx.tool.hook("execute.after", async (e) => log("tool.execute.after." + e.tool, e))
    await ctx.session.hook("prompt", async (e) => log("session.prompt", e))
    await ctx.session.hook("experimental.idle", async (e) => {
      log("session.idle", e)
      try { log("session.idle.context", await ctx.session.context({ sessionID: e.sessionID })) } catch (err) { log("session.idle.context.error", String(err)) }
    })
  },
})
`;
    fs.writeFileSync(path.join(dir, '.opencode', 'plugins', 'capture.js'), plugin);
    console.log(`Run this yourself (it uses your configured model credentials):\n  cd ${dir} && git init\n  opencode run -m <provider/model> "Run the shell command echo hi, then reply done"\n  # approve the bash permission when asked`);
  }
  console.log(`\nThen collect: node scripts/capture-agent-payloads.mjs collect ${agent} ${dir}`);
} else {
  if (!fs.existsSync(out)) {
    console.error(`no payloads in ${out}; run the agent first`);
    process.exit(1);
  }
  const dst = path.join(root, 'test', 'fixtures', agent, 'captured');
  fs.mkdirSync(dst, { recursive: true });
  const scrub = (s) => s.split(dir).join('/work/proj').split(os.homedir()).join('/home/user');
  let n = 0;
  for (const f of fs.readdirSync(out)) {
    if (!f.endsWith('.json')) continue;
    fs.writeFileSync(path.join(dst, f.replace(/\.\d+\.json$/, '.json')), scrub(fs.readFileSync(path.join(out, f), 'utf8')));
    n++;
  }
  console.log(`copied ${n} payload(s) to ${path.relative(root, dst)}. Review them (paths are scrubbed, secrets are not), then compare with the constructed fixtures.`);
}
