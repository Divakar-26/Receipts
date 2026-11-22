import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
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

export async function run(kind: 'session' | 'prompt' | 'stop'): Promise<void> {
  let p: any;
  try {
    p = JSON.parse(await readStdin());
  } catch {
    process.exit(0);
  }
  const cwd: string = typeof p.cwd === 'string' ? p.cwd : process.cwd();
  const session: string = typeof p.session_id === 'string' ? p.session_id : 'unknown';
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
      log(cwd, { event: 'session', source: p.source, session, injected: rules.length > 0 });
      if (rules) emit({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: rules } });
    } else if (kind === 'prompt') {
      resetTurn(statePath(cwd), session);
      log(cwd, { event: 'prompt', session });
    } else {
      const message: string = typeof p.last_assistant_message === 'string' ? p.last_assistant_message : '';
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
        stopHookActive: !!p.stop_hook_active,
      });
      try {
        fs.mkdirSync(path.join(cwd, '.receipts'), { recursive: true });
        fs.writeFileSync(path.join(cwd, '.receipts', 'last-report.md'), out.text + '\n');
      } catch {
        /* ignore */
      }
      log(cwd, {
        event: 'stop',
        session,
        stop_hook_active: !!p.stop_hook_active,
        block: out.decision.block,
        capped: out.decision.capped,
        labels: out.results.map((r) => ({ type: r.claim.type, checkedAs: r.checkedAs, label: r.label, strong: !!r.strong, stale: !!r.stale, text: r.claim.text.slice(0, 80), summary: r.summary.slice(0, 160) })),
        elapsedMs: out.elapsedMs,
      });
      if (out.decision.block) {
        state.sessions[session] = { blocks: (state.sessions[session]?.blocks ?? 0) + 1 };
        state.currentSession = session;
        saveState(sFile, state);
        emit({ decision: 'block', reason: out.blockMessage, systemMessage: out.text });
      } else if (out.results.length || out.warnings.length) {
        emit({ systemMessage: out.text });
      }
    }
  } catch (e) {
    log(cwd, { event: kind, error: (e as Error).message });
  }
  process.exit(0);
}
