/**
 * Per-agent payload and output shapes. Claude Code's are verified against captured
 * payloads (test/fixtures/claude-code). Codex, Gemini and OpenCode are built from
 * their docs / type definitions and are NOT yet verified against real payloads.
 */
export type Agent = 'claude' | 'codex' | 'gemini' | 'opencode';
export const AGENTS: readonly Agent[] = ['claude', 'codex', 'gemini', 'opencode'];
export const AGENT_LABEL: Record<Agent, string> = { claude: 'claude-code', codex: 'codex', gemini: 'gemini-cli', opencode: 'opencode' };

export interface StopInput {
  message: string;
  session: string;
  cwd: string;
  stopHookActive: boolean;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Final assistant message + context from an agent's "turn finished" payload. */
export function stopInput(agent: Agent, p: any): StopInput {
  const message = agent === 'gemini' ? str(p.prompt_response) : str(p.last_assistant_message);
  return {
    message,
    session: str(p.session_id) || 'unknown',
    cwd: str(p.cwd) || process.cwd(),
    stopHookActive: !!p.stop_hook_active,
  };
}

/** Rules injected as model context at session start. OpenCode has no such hook (AGENTS.md block instead). */
export function sessionOutput(agent: Agent, rules: string): unknown | null {
  if (agent === 'opencode' || !rules) return null;
  return { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: rules } };
}

/** What the "turn finished" hook prints. Gemini rejects with `deny` (forces a retry turn); the others use `block`. */
export function stopOutput(agent: Agent, o: { block: boolean; reason: string; text: string }): unknown {
  if (o.block) return { decision: agent === 'gemini' ? 'deny' : 'block', reason: o.reason, systemMessage: o.text };
  return { systemMessage: o.text };
}

export const isBlockOutput = (agent: Agent, out: any): boolean => out?.decision === (agent === 'gemini' ? 'deny' : 'block');

// ---- shell tool results -------------------------------------------------

export interface ShellResult {
  exit: number | null;
  output: string;
}

const EXIT_RES = [/^\s*Exit code:\s*(-?\d+)/im, /^\s*Exit Code:\s*(-?\d+)/im, /\bexit(?:ed)? (?:with )?(?:code|status)[: ]+(-?\d+)/i];

export function exitFromText(text: string): number | null {
  for (const re of EXIT_RES) {
    const m = re.exec(text);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Codex `tool_response` is "tool-specific"; accept a string or a loose object. */
export function codexShellResult(resp: unknown): ShellResult {
  if (typeof resp === 'string') return { exit: exitFromText(resp), output: resp };
  if (!resp || typeof resp !== 'object') return { exit: null, output: '' };
  const r = resp as Record<string, any>;
  const meta = (r.metadata ?? {}) as Record<string, unknown>;
  const exit = [r.exit_code, r.exitCode, r.exit, r.code, meta.exit_code, meta.exitCode].map(num).find((x) => x !== null) ?? null;
  const output =
    str(r.output) || str(r.aggregated_output) || [str(r.stdout), str(r.stderr)].filter(Boolean).join('\n') || str(r.content) || str(r.text) || '';
  return { exit: exit ?? exitFromText(output), output };
}

/** Gemini `tool_response`: { llmContent, returnDisplay, error? }. The shell tool's llmContent has "Exit Code: N". */
export function geminiShellResult(resp: any): ShellResult {
  if (!resp || typeof resp !== 'object') return { exit: null, output: '' };
  const llm = typeof resp.llmContent === 'string' ? resp.llmContent : Array.isArray(resp.llmContent) ? resp.llmContent.map((p: any) => str(p?.text)).join('\n') : '';
  // llmContent is "Command: …\nDirectory: …\nOutput: <stdout>\nError: …\nExit Code: N\nSignal: …"; keep just the stdout.
  const stdout = /(?:^|\n)Output: ([\s\S]*?)\n(?:Error|Exit Code|Signal): /.exec(llm)?.[1];
  const output = stdout ?? (llm || str(resp.returnDisplay) || str(resp.error?.message));
  return { exit: exitFromText(llm), output };
}

export const SHELL_TOOLS: Record<Agent, RegExp> = {
  claude: /^Bash$/,
  codex: /^(?:Bash|shell|local_shell|exec_command)$/i,
  gemini: /^run_shell_command$/,
  opencode: /^bash$/i,
};
export const URL_RE = /https?:\/\/[^\s)"'>]+/;
