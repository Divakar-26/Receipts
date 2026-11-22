// Builds demo.cast (asciicast v2) from the recorded real session in test/e2e/05-second-caller.
// All text is taken from that transcript; the TIMING IS SYNTHETIC (this is a replay, not a live recording).
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const transcript = fs.readFileSync(path.join(root, 'test/e2e/05-second-caller/transcript.jsonl'), 'utf8');
const lines = transcript.trim().split('\n').map((l) => JSON.parse(l));
const W = 100;
const events = [];
let t = 0.3;
const out = (s, dt = 0.05) => {
  t += dt;
  events.push([Math.round(t * 1000) / 1000, 'o', s.replace(/\n/g, '\r\n')]);
};
const type = (s) => {
  for (const ch of s) out(ch, 0.025);
};
const C = { dim: '\x1b[2m', b: '\x1b[1m', r: '\x1b[31m', g: '\x1b[32m', c: '\x1b[36m', y: '\x1b[33m', x: '\x1b[0m' };
const wrapLine = (l) => (l.length <= W - 2 ? [l] : l.match(new RegExp('.{1,' + (W - 2) + '}(\\s|$)', 'g')) || [l]);
const wrap = (s) => s.split('\n').flatMap(wrapLine).join('\n');

out(C.dim + '# Replay of a real Claude Code session (test/e2e/05-second-caller). Timing is synthetic.' + C.x + '\n', 0.2);
out(C.dim + '# Fixture: verifyToken is called from src/login.js AND lib/admin/panel.js.' + C.x + '\n\n', 0.3);
out(C.g + '$' + C.x + ' ', 0.4);
type('claude -p "End your reply with: only | verifyToken is only called from login | symbol: verifyToken | in: src/login.js"\n');
out('\n', 0.6);
let stops = 0;
for (const l of lines) {
  if (l.role === 'tool_use') {
    out(C.dim + '● ' + l.name + '(' + JSON.stringify(l.input).slice(0, 80) + ')' + C.x + '\n\n', 0.5);
  } else if (l.role === 'assistant') {
    out(wrap(l.text) + '\n\n', 0.8);
  } else if (l.role === 'hook' && l.event === 'Stop') {
    stops++;
    const j = JSON.parse(l.output);
    out(C.dim + '── Stop hook: receipts ─────────────────────────────────────────────' + C.x + '\n', 0.6);
    const msg = wrap(j.systemMessage)
      .replace(/^🧾 Receipts[^\n]*/m, (m) => C.b + m + C.x)
      .replace(/^❌.*$/gm, (m) => C.r + m + C.x)
      .replace(/^📎.*$/gm, (m) => C.c + m + C.x);
    out(msg + '\n', 0.3);
    if (j.decision === 'block') {
      out('\n' + C.y + '↩ blocked once: the agent is sent back with the exact problem' + C.x + '\n' + C.dim + wrap(j.reason) + C.x + '\n\n', 0.8);
    } else {
      out('\n' + C.g + '✔ turn ends; the user sees the final report' + C.x + '\n', 0.8);
    }
  }
}
const header = {
  version: 2,
  width: W,
  height: 40,
  timestamp: 1795370000,
  title: 'Receipts: a false "only called from" claim is caught, then fixed (replay of a real session)',
  env: { SHELL: '/bin/bash', TERM: 'xterm-256color' },
};
fs.writeFileSync(path.join(root, 'demo.cast'), [JSON.stringify(header), ...events.map((e) => JSON.stringify(e))].join('\n') + '\n');
console.log('demo.cast: ' + events.length + ' events, ' + t.toFixed(1) + 's, ' + stops + ' stop hooks');
