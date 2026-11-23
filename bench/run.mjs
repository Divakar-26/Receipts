// Runs benchmark tasks through REAL Claude Code sessions under three conditions:
//   A  baseline: nothing installed
//   B  rules + skill only: the SessionStart rules injection and the skill, no checker (no ledger, no Stop hook)
//   C  full Receipts (`receipts init --agent claude`)
//
//   node bench/run.mjs --split test --conditions A,B,C --runs 2 --concurrency 4 [--tasks ts-01,py-] [--tag name] [--max-budget 2]
//
// Every run costs real Claude usage. Resumable: finished runs (meta.json present) are skipped.
import * as zlib from 'node:zlib';
import * as os from 'node:os';
import { spawn, execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { loadTasks, buildWorkspace, runHidden, sh, tmpDir, ROOT, BENCH, fs, path } from './lib.mjs';

const { values: o } = parseArgs({
  options: {
    split: { type: 'string', default: 'test' },
    conditions: { type: 'string', default: 'A,B,C' },
    runs: { type: 'string', default: '1' },
    concurrency: { type: 'string', default: '3' },
    tasks: { type: 'string' },
    tag: { type: 'string', default: 'run' },
    'max-budget': { type: 'string', default: '2' },
    timeout: { type: 'string', default: '600' },
  },
});
const MAIN = path.join(ROOT, 'dist/cli/main.js');
const outRoot = path.join(BENCH, 'results', o.tag, 'runs');
fs.mkdirSync(outRoot, { recursive: true });

const jobs = [];
const want = o.tasks?.split(',');
for (const t of loadTasks({ split: o.split })) {
  if (want && !want.some((w) => t.id.startsWith(w))) continue;
  for (const cond of o.conditions.split(',')) for (let n = 1; n <= Number(o.runs); n++) jobs.push({ t, cond, n });
}
// interleave so a partial run still has all conditions for the tasks it reached
jobs.sort((a, b) => a.t.id.localeCompare(b.t.id) || a.n - b.n || a.cond.localeCompare(b.cond));

function install(cond, dir) {
  if (cond === 'A') return;
  execFileSync(process.execPath, [MAIN, 'init', '--cwd', dir, '--agent', 'claude'], { stdio: 'ignore' });
  if (cond === 'B') {
    // rules injection + skill only: drop every hook except SessionStart, so there is no ledger and no checker
    const f = path.join(dir, '.claude', 'settings.json');
    const s = JSON.parse(fs.readFileSync(f, 'utf8'));
    s.hooks = { SessionStart: s.hooks.SessionStart };
    fs.writeFileSync(f, JSON.stringify(s, null, 2));
  }
}

function claude(prompt, dir) {
  return new Promise((resolve) => {
    const args = ['-p', prompt, '--allowedTools', 'Bash', 'Edit', 'Write', 'Read', 'Grep', 'Glob', '--output-format', 'stream-json', '--verbose', '--include-hook-events', '--max-budget-usd', o['max-budget']];
    const child = spawn('claude', args, { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    const timer = setTimeout(() => child.kill('SIGKILL'), Number(o.timeout) * 1000);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, out });
    });
  });
}

async function runJob({ t, cond, n }) {
  const id = `${t.id}__${cond}__${n}`;
  const outDir = path.join(outRoot, id);
  if (fs.existsSync(path.join(outDir, 'meta.json'))) return { id, skipped: true };
  fs.mkdirSync(outDir, { recursive: true });
  const dir = buildWorkspace(t, tmpDir(`bench-${id}-`));
  install(cond, dir);
  const t0 = Date.now();
  const r = await claude(t.prompt, dir);
  const wall = Date.now() - t0;
  const events = r.out.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const init = events.find((e) => e.type === 'system' && e.subtype === 'init');
  const result = events.find((e) => e.type === 'result');
  const lastAssistant = [...events].reverse().find((e) => e.type === 'assistant' && e.message.content.some((c) => c.type === 'text'));
  const finalText = result?.result ?? lastAssistant?.message.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n') ?? '';
  // reality first (the final repo as the agent left it), then the hidden tests
  const claims = t.claims.map((c) => ({ id: c.id, reality: sh(c.reality, dir).code }));
  const hidden = runHidden(t, dir);
  const hookLog = fs.existsSync(path.join(dir, '.receipts/hook.log')) ? fs.readFileSync(path.join(dir, '.receipts/hook.log'), 'utf8') : '';
  const stops = hookLog.split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((e) => e.event === 'stop');
  const clean = (s) => s.split(dir).join('/work/proj').split(os.homedir()).join('/home/user');
  fs.writeFileSync(path.join(outDir, 'stream.jsonl.gz'), zlib.gzipSync(clean(r.out)));
  fs.writeFileSync(path.join(outDir, 'final.txt'), clean(finalText));
  if (hookLog) fs.writeFileSync(path.join(outDir, 'hook.log'), clean(hookLog));
  const u = result?.usage ?? {};
  const meta = {
    id, task: t.id, repo: t.repo, pattern: t.pattern, split: t.split, condition: cond, run: n,
    model: init?.model ?? null, claude_version: init?.claude_code_version ?? null,
    exit: r.code, is_error: !!result?.is_error, subtype: result?.subtype ?? null,
    cost_usd: result?.total_cost_usd ?? null, turns: result?.num_turns ?? null, duration_ms: result?.duration_ms ?? null, wall_ms: wall,
    tokens: { input: u.input_tokens ?? 0, output: u.output_tokens ?? 0, cache_read: u.cache_read_input_tokens ?? 0, cache_creation: u.cache_creation_input_tokens ?? 0 },
    final_text: clean(finalText),
    claims, hidden_exit: hidden.code,
    receipts: { stops: stops.length, blocks: stops.filter((s) => s.block).length, stop_events: stops },
  };
  fs.writeFileSync(path.join(outDir, 'meta.json'), JSON.stringify(meta, null, 2));
  fs.rmSync(dir, { recursive: true, force: true });
  return { id, cost: meta.cost_usd, hidden: hidden.code === 0, claims: claims.map((c) => c.reality), blocks: meta.receipts.blocks, secs: Math.round(wall / 1000) };
}

let done = 0, spent = 0;
const queue = [...jobs];
console.log(`${jobs.length} runs, concurrency ${o.concurrency}, results in ${path.relative(ROOT, outRoot)}`);
async function worker() {
  while (queue.length) {
    const j = queue.shift();
    let r;
    try {
      r = await runJob(j);
    } catch (e) {
      r = { id: `${j.t.id}__${j.cond}__${j.n}`, error: e.message };
    }
    done++;
    spent += r.cost ?? 0;
    console.log(`[${done}/${jobs.length}] ${r.id} ${r.skipped ? 'skipped' : r.error ? 'ERROR ' + r.error : `hidden=${r.hidden ? 'pass' : 'FAIL'} reality=${r.claims} blocks=${r.blocks} $${(r.cost ?? 0).toFixed(3)} ${r.secs}s`}  (total $${spent.toFixed(2)})`);
  }
}
await Promise.all(Array.from({ length: Number(o.concurrency) }, worker));
console.log(`done. spent $${spent.toFixed(2)}`);
