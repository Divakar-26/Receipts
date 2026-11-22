import * as fs from 'node:fs';
import * as path from 'node:path';

export interface SessionState {
  blocks: number;
}
export interface State {
  currentSession?: string;
  sessions: Record<string, SessionState>;
}

export const statePath = (cwd: string) => path.join(cwd, '.receipts', 'state.json');

export function loadState(file: string): State {
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (j && typeof j === 'object' && j.sessions && typeof j.sessions === 'object') return j as State;
  } catch {
    /* fresh */
  }
  return { sessions: {} };
}

export function saveState(file: string, s: State): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const keys = Object.keys(s.sessions);
  for (const k of keys.slice(0, Math.max(0, keys.length - 20))) delete s.sessions[k];
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(s));
  fs.renameSync(tmp, file);
}

/** UserPromptSubmit / BeforeAgent: a new user turn starts, so the retry counter resets. */
export function resetTurn(file: string, session: string): void {
  const s = loadState(file);
  s.currentSession = session;
  s.sessions[session] = { blocks: 0 };
  saveState(file, s);
}
