#!/usr/bin/env node
// Dispatcher: `receipts-hook <claude|codex|gemini|opencode> <ledger|session|prompt|stop>`.
// Imports only the module it needs so the ledger hook stays tiny.
import { AGENTS, Agent } from '../core/agents.js';
const [agent, kind] = process.argv.slice(2);
if (AGENTS.includes(agent as Agent) && kind === 'ledger') {
  (await import('./hook-ledger.js')).run(agent as Agent);
} else if (AGENTS.includes(agent as Agent) && (kind === 'session' || kind === 'prompt' || kind === 'stop')) {
  await (await import('./hook-agent.js')).run(agent as Agent, kind);
} else {
  process.stderr.write('usage: receipts-hook <claude|codex|gemini|opencode> <ledger|session|prompt|stop>\n');
  process.exit(64);
}
