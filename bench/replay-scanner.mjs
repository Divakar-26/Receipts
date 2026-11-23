// FREE (no model calls): replays saved agent messages through the CURRENT scanner and lists the sentences it would
// report as strong untagged claims. Uses every assistant message that reached a Stop hook in the saved runs.
//
//   node bench/replay-scanner.mjs <tag> [<tag> ...]
//
// Caveat: the scanner rules may have been changed after reading these same messages, so this is a regression
// check, NOT an unbiased measurement.
import * as zlib from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { BENCH, ROOT, fs, path } from './lib.mjs';

const core = await import(pathToFileURL(path.join(ROOT, 'dist/core/index.js')).href);
const m = core.buildMatchers();
const tags = process.argv.slice(2);
if (!tags.length) {
  console.error('usage: node bench/replay-scanner.mjs <tag> [<tag> ...]');
  process.exit(64);
}

let messages = 0;
const flagged = [];
for (const tag of tags) {
  const runs = path.join(BENCH, 'results', tag, 'runs');
  if (!fs.existsSync(runs)) continue;
  for (const id of fs.readdirSync(runs).sort()) {
    const f = path.join(runs, id, 'stream.jsonl.gz');
    if (!fs.existsSync(f)) continue;
    const events = zlib.gunzipSync(fs.readFileSync(f)).toString('utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    let last = null;
    for (const e of events) {
      if (e.type === 'assistant') {
        const t = e.message.content.filter((c) => c.type === 'text').map((c) => c.text).join('');
        if (t) last = t;
      }
      if (e.type === 'system' && e.subtype === 'hook_response' && e.hook_event === 'Stop' && last) {
        messages++;
        const parsed = core.parseMessage(last);
        const scan = core.scanProse(parsed.outside + '\n' + parsed.untagged.map((u) => u.text).join('\n'), parsed.claims, m);
        for (const fl of scan.flagged) {
          const kind = fl.kind === 'testpass' ? 'testpass' : core.autoClaimForUniversal(fl.sentence) ? 'auto' : 'report';
          flagged.push({ run: `${tag}/${id}`, kind, sentence: fl.sentence });
        }
        last = null;
      }
    }
  }
}
for (const f of flagged) console.log(`${f.kind.padEnd(9)} ${f.run.padEnd(52)} ${f.sentence.slice(0, 150)}`);
const n = (k) => flagged.filter((f) => f.kind === k).length;
console.log(`\n${messages} replayed message(s): ${flagged.length} untagged strong sentence(s): ${n('report')} reported as "no receipt", ${n('auto')} verified by a repo search, ${n('testpass')} checked against the ledger.`);
