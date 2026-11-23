#!/usr/bin/env node
// Ledger hook for every agent. Kept tiny: no tree-sitter, no ripgrep.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { entryFromAgent, appendEntry, ledgerPath } from '../core/ledger-hook.js';
import type { Agent } from '../core/agents.js';

export function run(agent: Agent): void {
let data = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => (data += c));
process.stdin.on('end', async () => {
  try {
    const p = JSON.parse(data);
    const cwd = typeof p.cwd === 'string' ? p.cwd : process.cwd();
    let cfg: { testCommand?: string; buildCommand?: string } = {};
    try {
      const j = JSON.parse(fs.readFileSync(path.join(cwd, '.receipts.json'), 'utf8'));
      cfg = { testCommand: j.testCommand, buildCommand: j.buildCommand };
    } catch { /* no config */ }
    const e = await entryFromAgent(agent, p, cfg);
    if (e) appendEntry(ledgerPath(cwd), e);
  } catch {
    /* a ledger hook must never break the agent */
  }
  process.exit(0);
});
}
