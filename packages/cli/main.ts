#!/usr/bin/env node
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseArgs } from 'node:util';
import { spawn } from 'node:child_process';
import { init, uninstall, detectAgents } from './init.js';
import { AGENTS, Agent } from '../core/index.js';
import { check, loadConfig, readLedger, ledgerPath, formatReport, loadState, saveState, statePath, buildShellEntry, appendEntry, Mode } from '../core/index.js';

const USAGE = `receipts — no claim without proof

  receipts check --message <file|-> [--ledger <file>] [--cwd <dir>] [--session <id>] [--state <file>]
                 [--mode block|warn|strict] [--stop-hook-active] [--json] [--no-write]
  receipts run -- <command...>     run a command and log its real exit code to the ledger
  receipts report [--cwd <dir>]    reprint the last report
  receipts init [--agent auto|all|claude|codex|gemini|opencode] [--cwd <dir>] [--dry-run]
                                   install at project level (auto = agents found on PATH)
  receipts uninstall [--cwd <dir>] [--keep-data]  reverse init

Exit codes (check): 0 = ok, 2 = blocked (reason on stderr).`;

function readMessage(p: string): string {
  return p === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(p, 'utf8');
}

async function cmdCheck(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      message: { type: 'string' }, ledger: { type: 'string' }, cwd: { type: 'string' }, session: { type: 'string' },
      state: { type: 'string' }, mode: { type: 'string' }, json: { type: 'boolean' }, 'stop-hook-active': { type: 'boolean' },
      'no-write': { type: 'boolean' }, timeout: { type: 'string' },
    },
  });
  if (!values.message) {
    console.error('receipts check: --message <file> is required\n\n' + USAGE);
    return 64;
  }
  const cwd = path.resolve(values.cwd ?? process.cwd());
  const config = loadConfig(cwd);
  if (values.mode === 'block' || values.mode === 'warn' || values.mode === 'strict') config.mode = values.mode as Mode;
  const ledger = readLedger(values.ledger ?? ledgerPath(cwd));
  const sFile = values.state ?? statePath(cwd);
  const state = loadState(sFile);
  const session = values.session ?? state.currentSession;
  const out = await check({
    message: readMessage(values.message),
    ledger,
    cwd,
    config,
    session,
    blocksSoFar: state.sessions[session ?? '']?.blocks ?? 0,
    stopHookActive: values['stop-hook-active'],
    timeoutMs: values.timeout ? parseInt(values.timeout, 10) : undefined,
  });
  if (out.decision.block && session) {
    state.sessions[session] = { blocks: (state.sessions[session]?.blocks ?? 0) + 1 };
    saveState(sFile, state);
  }
  if (!values['no-write']) {
    try {
      fs.mkdirSync(path.join(cwd, '.receipts'), { recursive: true });
      fs.writeFileSync(path.join(cwd, '.receipts', 'last-report.md'), out.text + '\n');
    } catch { /* read-only dir: ignore */ }
  }
  if (values.json) {
    console.log(JSON.stringify({ decision: out.decision, results: out.results, warnings: out.warnings, elapsedMs: out.elapsedMs, report: out.text }, null, 2));
  } else {
    console.log(formatReport(out.report, !!process.stdout.isTTY));
  }
  if (out.decision.block) {
    console.error(out.blockMessage);
    return 2;
  }
  return 0;
}

async function cmdRun(argv: string[]): Promise<number> {
  const args = argv[0] === '--' ? argv.slice(1) : argv;
  if (!args.length) {
    console.error('receipts run: no command given');
    return 64;
  }
  const cwd = process.cwd();
  const state = loadState(statePath(cwd));
  const session = process.env.RECEIPTS_SESSION ?? state.currentSession ?? 'unknown';
  // The agent chose this command, exactly as it would in its own shell. A single
  // argument is run through the shell so pipes work; several are exec'd directly.
  const child = args.length === 1 ? spawn(args[0], { cwd, shell: true }) : spawn(args[0], args.slice(1), { cwd });
  let out = '';
  const tee = (stream: NodeJS.ReadableStream, sink: NodeJS.WriteStream) =>
    stream.on('data', (d: Buffer) => {
      sink.write(d);
      out = (out + d.toString('utf8')).slice(-64 * 1024);
    });
  tee(child.stdout!, process.stdout);
  tee(child.stderr!, process.stderr);
  const code: number = await new Promise((res) => {
    child.on('error', (e) => {
      process.stderr.write(`receipts run: ${e.message}\n`);
      res(127);
    });
    child.on('close', (c, sig) => res(c ?? (sig ? 128 : 1)));
  });
  const cfg = loadConfig(cwd);
  const e = await buildShellEntry({ session, agent: process.env.RECEIPTS_AGENT ?? 'receipts-run', cmd: args.join(' '), exit: code, output: out, cwd, testCommand: cfg.testCommand, buildCommand: cfg.buildCommand });
  // Our own exit code is the truth, even if the command string contains a pipe.
  if (e.kind === 'shell') e.exit_trusted = args.length > 1 || !/[|;&]/.test(args[0]);
  appendEntry(ledgerPath(cwd), e);
  return code;
}

function cmdReport(argv: string[]): number {
  const { values } = parseArgs({ args: argv, options: { cwd: { type: 'string' } } });
  const f = path.join(path.resolve(values.cwd ?? process.cwd()), '.receipts', 'last-report.md');
  try {
    process.stdout.write(fs.readFileSync(f, 'utf8'));
    return 0;
  } catch {
    console.error('receipts report: no report yet');
    return 1;
  }
}

function cmdInit(argv: string[], un: boolean): number {
  const { values } = parseArgs({ args: argv, options: { cwd: { type: 'string' }, agent: { type: 'string', multiple: true }, 'dry-run': { type: 'boolean' }, 'keep-data': { type: 'boolean' } } });
  const cwd = path.resolve(values.cwd ?? process.cwd());
  try {
    const lines: string[] = [];
    let agents: Agent[] = [];
    if (!un) {
      const asked = (values.agent ?? ['auto']).flatMap((a) => a.split(','));
      const bad = asked.find((a) => a !== 'auto' && a !== 'all' && !AGENTS.includes(a as Agent));
      if (bad) throw new Error(`unknown agent '${bad}' (use auto, all, ${AGENTS.join(', ')})`);
      if (asked.includes('all')) agents = [...AGENTS];
      else if (asked.includes('auto')) {
        agents = detectAgents();
        lines.push(agents.length ? `detected on PATH: ${agents.join(', ')}` : 'no agent CLI found on PATH; installing for claude');
        if (!agents.length) agents = ['claude'];
      } else agents = asked as Agent[];
    }
    lines.push(...(un ? uninstall({ cwd, keepData: values['keep-data'] }) : init({ cwd, agents, dryRun: values['dry-run'] })));
    for (const l of lines) console.log((values['dry-run'] ? '[dry run] ' : '') + '• ' + l);
    return 0;
  } catch (e) {
    console.error(`receipts: ${(e as Error).message}`);
    return 1;
  }
}

const [cmd, ...rest] = process.argv.slice(2);
const main = async (): Promise<number> => {
  switch (cmd) {
    case 'check': return cmdCheck(rest);
    case 'run': return cmdRun(rest);
    case 'report': return cmdReport(rest);
    case 'init': return cmdInit(rest, false);
    case 'uninstall': return cmdInit(rest, true);
    case undefined: case '-h': case '--help': console.log(USAGE); return 0;
    default: console.error(`receipts: unknown command '${cmd}'\n\n${USAGE}`); return 64;
  }
};
main().then((c) => process.exit(c), (e) => { console.error(`receipts: ${(e as Error).message}`); process.exit(1); });
