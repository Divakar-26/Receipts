import { analyseCommand, exitTrusted, isTestOrBuild, unwrapReceiptsRun } from './cmd.js';
import { ledgerPath, tailLines, appendEntry, redact } from './ledger.js';
import { parseSummary } from './runners/index.js';
import { LedgerEntry } from './types.js';
import { Agent, AGENT_LABEL, SHELL_TOOLS, URL_RE, codexShellResult, geminiShellResult } from './agents.js';

export interface ShellRecord {
  session: string;
  agent: string;
  cmd: string;
  exit: number | null;
  /** Combined stdout+stderr. */
  output: string;
  cwd: string;
  testCommand?: string;
  buildCommand?: string;
}

/** Build a shell ledger entry. Snapshot (git) is taken only for test/build commands. */
export async function buildShellEntry(r: ShellRecord): Promise<LedgerEntry> {
  const cfg = { testCommand: r.testCommand, buildCommand: r.buildCommand };
  const cmd = redact(unwrapReceiptsRun(r.cmd));
  const trusted = r.exit !== null && exitTrusted(cmd, cfg);
  const e: LedgerEntry = {
    session: r.session,
    ts: new Date().toISOString(),
    agent: r.agent,
    kind: 'shell',
    cmd,
    exit: r.exit,
    exit_trusted: trusted,
    summary: parseSummary(r.output),
    out_tail: tailLines(r.output, 40),
  };
  if (analyseCommand(cmd).length && isTestOrBuild(cmd, cfg)) {
    const { takeSnapshot } = await import('./snapshot.js');
    e.snap = await takeSnapshot(r.cwd);
  }
  return e;
}

/**
 * Claude Code hook payloads -> ledger entry (captured real payloads in
 * test/fixtures/claude-code). `PostToolUse` has no exit code (success implies
 * 0); a failing Bash call arrives as `PostToolUseFailure` with "Exit code N"
 * in `error`.
 */
export async function entryFromClaude(p: any, cfg: { testCommand?: string; buildCommand?: string } = {}): Promise<LedgerEntry | null> {
  if (!p || typeof p !== 'object' || typeof p.session_id !== 'string') return null;
  const ev = p.hook_event_name;
  const cwd = typeof p.cwd === 'string' ? p.cwd : process.cwd();
  if ((ev === 'PostToolUse' || ev === 'PostToolUseFailure') && p.tool_name === 'WebFetch') {
    const url = p.tool_input?.url;
    if (ev !== 'PostToolUse' || typeof url !== 'string') return null;
    return { session: p.session_id, ts: new Date().toISOString(), agent: 'claude-code', kind: 'web', url };
  }
  if (p.tool_name !== 'Bash' || typeof p.tool_input?.command !== 'string') return null;
  const cmd: string = p.tool_input.command;
  let exit: number | null;
  let output: string;
  if (ev === 'PostToolUse') {
    const r = p.tool_response ?? {};
    exit = p.tool_input.run_in_background ? null : 0;
    output = [r.stdout, r.stderr].filter((x) => typeof x === 'string' && x).join('\n');
  } else if (ev === 'PostToolUseFailure') {
    const err = typeof p.error === 'string' ? p.error : '';
    const m = /^Exit code (\d+)\n?/.exec(err);
    exit = m ? parseInt(m[1], 10) : null;
    output = m ? err.slice(m[0].length) : err;
  } else return null;
  return buildShellEntry({ session: p.session_id, agent: 'claude-code', cmd, exit, output, cwd, ...cfg });
}

type Cfg = { testCommand?: string; buildCommand?: string };

/**
 * Codex PostToolUse: `tool_name` Bash, `tool_input.command`, `tool_response` of unspecified shape.
 * Built from docs (https://learn.chatgpt.com/docs/hooks); NOT verified against a real payload.
 */
export async function entryFromCodex(p: any, cfg: Cfg = {}): Promise<LedgerEntry | null> {
  if (!p || typeof p.session_id !== 'string' || p.hook_event_name !== 'PostToolUse') return null;
  const cwd = typeof p.cwd === 'string' ? p.cwd : process.cwd();
  if (!SHELL_TOOLS.codex.test(p.tool_name ?? '')) return null;
  const cmd = p.tool_input?.command;
  if (typeof cmd !== 'string') return null;
  const r = codexShellResult(p.tool_response);
  return buildShellEntry({ session: p.session_id, agent: AGENT_LABEL.codex, cmd: cmd, exit: r.exit, output: r.output, cwd, ...cfg });
}

/**
 * Gemini AfterTool: `tool_name` run_shell_command, `tool_input.command`, `tool_response.llmContent`.
 * Built from docs (https://geminicli.com/docs/hooks/reference/); NOT verified against a real payload.
 */
export async function entryFromGemini(p: any, cfg: Cfg = {}): Promise<LedgerEntry | null> {
  if (!p || typeof p.session_id !== 'string' || p.hook_event_name !== 'AfterTool') return null;
  const cwd = typeof p.cwd === 'string' ? p.cwd : process.cwd();
  if (SHELL_TOOLS.gemini.test(p.tool_name ?? '') && typeof p.tool_input?.command === 'string') {
    const r = geminiShellResult(p.tool_response);
    return buildShellEntry({ session: p.session_id, agent: AGENT_LABEL.gemini, cmd: p.tool_input.command, exit: r.exit, output: r.output, cwd, ...cfg });
  }
  if (p.tool_name === 'web_fetch') {
    const url = URL_RE.exec(JSON.stringify(p.tool_input ?? {}))?.[0];
    if (url) return { session: p.session_id, ts: new Date().toISOString(), agent: AGENT_LABEL.gemini, kind: 'web', url };
  }
  return null;
}

/**
 * OpenCode: the plugin (adapters/opencode/receipts.js) posts
 * {session_id, cwd, tool, command, output, exit} after a bash tool call, or {session_id, tool:'webfetch', url}.
 */
export async function entryFromOpenCode(p: any, cfg: Cfg = {}): Promise<LedgerEntry | null> {
  if (!p || typeof p.session_id !== 'string') return null;
  const cwd = typeof p.cwd === 'string' ? p.cwd : process.cwd();
  if (typeof p.url === 'string') return { session: p.session_id, ts: new Date().toISOString(), agent: AGENT_LABEL.opencode, kind: 'web', url: p.url };
  if (typeof p.command !== 'string') return null;
  const exit = typeof p.exit === 'number' && Number.isFinite(p.exit) ? p.exit : null;
  return buildShellEntry({ session: p.session_id, agent: AGENT_LABEL.opencode, cmd: p.command, exit, output: typeof p.output === 'string' ? p.output : '', cwd, ...cfg });
}

export function entryFromAgent(agent: Agent, p: any, cfg: Cfg = {}): Promise<LedgerEntry | null> {
  return agent === 'claude' ? entryFromClaude(p, cfg) : agent === 'codex' ? entryFromCodex(p, cfg) : agent === 'gemini' ? entryFromGemini(p, cfg) : entryFromOpenCode(p, cfg);
}

export { ledgerPath, appendEntry };
