// Proves every task is sound WITHOUT any LLM:
//   before the task is done: the hidden tests FAIL
//   after the plausible NAIVE (partial) change: every claim's reality check FAILS, i.e. the trap bites and the claim would be false
//   after the reference SOLUTION: the hidden tests PASS and every reality check PASSES
// Usage: node bench/validate.mjs [task-id-prefix ...]
import { loadTasks, buildWorkspace, applySolution, applyChange, runHidden, sh, tmpDir, fs } from './lib.mjs';

const want = process.argv.slice(2);
let bad = 0;
for (const t of loadTasks().filter((t) => !want.length || want.some((w) => t.id.startsWith(w)))) {
  const problems = [];
  const before = buildWorkspace(t, tmpDir(`v-before-${t.id}-`));
  const h0 = runHidden(t, before);
  if (h0.code === 0) problems.push('hidden tests already pass before the task is done');
  // the plausible partial change: the trap must bite (every claim's reality FALSE)
  const naive = buildWorkspace(t, tmpDir(`v-naive-${t.id}-`));
  try {
    applyChange(t, naive, 'naive');
  } catch (e) {
    problems.push(`naive change failed: ${e.message}`);
  }
  const reality0 = [];
  for (const c of t.claims) {
    const r = sh(c.reality, naive);
    reality0.push(r.code);
    if (r.code === 0) problems.push(`claim "${c.id}": reality is TRUE after the naive change (the trap does not bite)`);
  }
  const hn = runHidden(t, naive);
  const after = buildWorkspace(t, tmpDir(`v-after-${t.id}-`));
  try {
    applySolution(t, after);
  } catch (e) {
    problems.push(`solution failed: ${e.message}`);
  }
  const h1 = runHidden(t, after);
  if (h1.code !== 0) problems.push(`hidden tests FAIL after the reference solution:\n${h1.out.split('\n').slice(-12).join('\n')}`);
  for (const c of t.claims) {
    const r = sh(c.reality, after);
    if (r.code !== 0) problems.push(`claim "${c.id}": reality still FALSE after the solution:\n${r.out.split('\n').slice(-8).join('\n')}`);
  }
  // does the visible suite pass at the start? (information only; tasks 07 are meant to fail it)
  console.log(`${problems.length ? '✖' : '✔'} ${t.id.padEnd(36)} hidden before=${h0.code === 0 ? 'PASS' : 'fail'} naive=${hn.code === 0 ? 'pass' : 'fail'} solution=${h1.code === 0 ? 'pass' : 'FAIL'}  reality after naive=${reality0.map((c) => (c === 0 ? 'TRUE' : 'false')).join(',')}`);
  for (const p of problems) console.log('    ' + p.replace(/\n/g, '\n    '));
  bad += problems.length ? 1 : 0;
  fs.rmSync(before, { recursive: true, force: true });
  fs.rmSync(naive, { recursive: true, force: true });
  fs.rmSync(after, { recursive: true, force: true });
}
console.log(bad ? `\n${bad} task(s) invalid` : '\nall tasks valid');
process.exit(bad ? 1 : 0);
