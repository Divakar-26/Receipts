#!/usr/bin/env node
// Dispatcher: `receipts-hook claude <ledger|session|prompt|stop>`.
// Imports only the module it needs so the ledger hook stays tiny.
const [agent, kind] = process.argv.slice(2);
if (agent === 'claude' && kind === 'ledger') await import('./hook-ledger-claude.js');
else if (agent === 'claude' && (kind === 'session' || kind === 'prompt' || kind === 'stop')) {
  const m = await import('./hook-claude.js');
  await m.run(kind);
} else {
  process.stderr.write('usage: receipts-hook claude <ledger|session|prompt|stop>\n');
  process.exit(64);
}
