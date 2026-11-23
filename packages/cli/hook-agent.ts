import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Agent, stopInput, sessionOutput, stopOutput } from '../core/index.js';
import { check, loadConfig, loadState, saveState, statePath, resetTurn, readLedger, ledgerPath, pruneLedger } from '../core/index.js';

export const RULES_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'rules', 'RULES.md');

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let d = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (d += c));
    process.stdin.on('end', () => resolve(d));
  });
}

function log(cwd: string, rec: Record<string, unknown>): void {
  try {
    fs.mkdirSync(path.join(cwd, '.receipts'), { recursive: true });
    fs.appendFileSync(path.join(cwd, '.receipts', 'hook.log'), JSON.stringify({ ts: new Date().toISOString(), ...rec }) + '\n');
  } catch {
    /* logging must never break the agent */
  }
}

const emit = (o: unknown) => process.stdout.write(JSON.stringify(o) + '\n');

export async function run(agent: Agent, kind: 'session' | 'prompt' | 'stop'): Promise<void> {
  let p: any;
  try {
    p = JSON.parse(await readStdin());
  } catch {
    process.exit(0);
  }
  const { cwd, session, message, stopHookActive } = stopInput(agent, p);
  try {
    if (kind === 'session') {
      resetTurn(statePath(cwd), session);
      try {
        pruneLedger(ledgerPath(cwd), 20);
      } catch {
        /* no ledger yet */
      }
      let rules = '';
      try {
        rules = fs.readFileSync(RULES_PATH, 'utf8');
      } catch {
        /* rules missing: stay silent rather than break the session */
      }
      log(cwd, { event: 'session', agent, source: p.source, session, injected: rules.length > 0 });
      const o = sessionOutput(agent, rules);
      if (o) emit(o);
    } else if (kind === 'prompt') {
      resetTurn(statePath(cwd), session);
      log(cwd, { event: 'prompt', agent, session });
    } else {
      const config = loadConfig(cwd);
      const sFile = statePath(cwd);
      const state = loadState(sFile);
      const out = await check({
        message,
        ledger: readLedger(ledgerPath(cwd)),
        cwd,
        config,
        session,
        blocksSoFar: state.sessions[session]?.blocks ?? 0,
        stopHookActive,
      });
      try {
        fs.mkdirSync(path.join(cwd, '.receipts'), { recursive: true });
        fs.writeFileSync(path.join(cwd, '.receipts', 'last-report.md'), out.text + '\n');
      } catch {
        /* ignore */
      }
      log(cwd, {
        event: 'stop',
        agent,
        session,
        stop_hook_active: stopHookActive,
        block: out.decision.block,
        capped: out.decision.capped,
        labels: out.results.map((r) => ({ type: r.claim.type, checkedAs: r.checkedAs, label: r.label, strong: !!r.strong, stale: !!r.stale, text: r.claim.text.slice(0, 80), summary: r.summary.slice(0, 160) })),
        elapsedMs: out.elapsedMs,
      });
      if (out.decision.block) {
        state.sessions[session] = { blocks: (state.sessions[session]?.blocks ?? 0) + 1 };
        state.currentSession = session;
        saveState(sFile, state);
        emit(stopOutput(agent, { block: true, reason: out.blockMessage, text: out.text }));
      } else if (out.results.length || out.warnings.length) {
        emit(stopOutput(agent, { block: false, reason: '', text: out.text }));
      }
    }
  } catch (e) {
    log(cwd, { event: kind, error: (e as Error).message });
  }
  process.exit(0);
}
