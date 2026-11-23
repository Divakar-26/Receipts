// Draws bench/results.png: confident-wrong claims per 100 runs for conditions A, B, C, with the range across runs.
//   node bench/chart.mjs <tag>
import { execFileSync } from 'node:child_process';
import { BENCH, ROOT, fs, path } from './lib.mjs';

const tag = process.argv[2];
if (!tag) {
  console.error('usage: node bench/chart.mjs <tag>');
  process.exit(64);
}
const summary = JSON.parse(fs.readFileSync(path.join(BENCH, 'results', tag, 'summary.json'), 'utf8'));
const conds = ['A', 'B', 'C'].filter((c) => summary.conditions[c]);
const LABEL = { A: 'A  no Receipts', B: 'B  rules + skill only', C: 'C  full Receipts' };
const COLOR = { A: '#8b95a5', B: '#e0a030', C: '#1f9d6b' };
const W = 1200, H = 675, L = 110, R = 60, T = 150, B = 130;
const plotW = W - L - R, plotH = H - T - B;
const maxVal = Math.max(10, ...conds.map((c) => Math.max(summary.conditions[c].confident_wrong_per_100, summary.conditions[c].per_run_range[1]))) * 1.25;
const y = (v) => T + plotH - (v / maxVal) * plotH;
const nice = (m) => { const s = [5, 10, 20, 25, 50, 100]; return s.find((x) => m / x <= 6) ?? 100; };
const step = nice(maxVal);
const bars = [];
const bw = 170, gap = 70;
const total = conds.length * bw + (conds.length - 1) * gap;
const x0 = L + (plotW - total) / 2;
let grid = '';
for (let v = 0; v <= maxVal; v += step) grid += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#e3e6ea"/><text x="${L - 14}" y="${y(v) + 6}" text-anchor="end" font-size="20" fill="#5b6472">${v}</text>`;
conds.forEach((c, i) => {
  const s = summary.conditions[c];
  const x = x0 + i * (bw + gap);
  const v = s.confident_wrong_per_100;
  const [lo, hi] = s.per_run_range;
  const cx = x + bw / 2;
  bars.push(`<rect x="${x}" y="${y(v)}" width="${bw}" height="${Math.max(2, y(0) - y(v))}" fill="${COLOR[c]}" rx="6"/>`);
  if (s.per_run_values.length > 1) bars.push(`<line x1="${cx}" x2="${cx}" y1="${y(lo)}" y2="${y(hi)}" stroke="#1b2430" stroke-width="3"/><line x1="${cx - 12}" x2="${cx + 12}" y1="${y(lo)}" y2="${y(lo)}" stroke="#1b2430" stroke-width="3"/><line x1="${cx - 12}" x2="${cx + 12}" y1="${y(hi)}" y2="${y(hi)}" stroke="#1b2430" stroke-width="3"/>`);
  bars.push(`<text x="${cx}" y="${y(Math.max(v, hi)) - 16}" text-anchor="middle" font-size="34" font-weight="700" fill="#1b2430">${v.toFixed(v < 10 ? 1 : 0)}</text>`);
  bars.push(`<text x="${cx}" y="${H - B + 38}" text-anchor="middle" font-size="22" font-weight="600" fill="#1b2430">${LABEL[c]}</text>`);
  bars.push(`<text x="${cx}" y="${H - B + 66}" text-anchor="middle" font-size="18" fill="#5b6472">${s.runs} runs · ${s.task_success_pct.toFixed(0)}% tasks done</text>`);
});
const model = (summary.models.filter(Boolean)[0] ?? 'Claude Code').toString();
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="DejaVu Sans, Helvetica, Arial, sans-serif">
<rect width="${W}" height="${H}" fill="#ffffff"/>
<text x="${L}" y="62" font-size="38" font-weight="700" fill="#1b2430">Confident-wrong claims per 100 tasks</text>
<text x="${L}" y="100" font-size="22" fill="#5b6472">Claude Code · ${model} · lower is better · whiskers: range across runs</text>
${grid}
<line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" stroke="#9aa3af" stroke-width="2"/>
${bars.join('\n')}
<text x="${L}" y="${H - 18}" font-size="16" fill="#8b95a5">a "confident-wrong claim" is a trap's false fact stated without a hedge · deterministic grading · bench/README.md</text>
</svg>`;
const out = path.join(BENCH, 'results.svg');
fs.writeFileSync(out, svg);
execFileSync('rsvg-convert', ['-o', path.join(BENCH, 'results.png'), out]);
console.log('wrote bench/results.svg and bench/results.png');
