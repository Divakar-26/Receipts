import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectCommands } from '../core/index.js';
import type { Agent } from '../core/agents.js';

export const MARKER = '--receipts';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.join(HERE, '..', '..');
export const HOOK_JS = path.join(HERE, 'hook.js');
export const SKILL_SRC = path.join(PKG, 'skill', 'SKILL.md');
export const RULES_SRC = path.join(PKG, 'rules', 'RULES.md');
export const OPENCODE_PLUGIN_SRC = path.join(PKG, 'adapters', 'opencode', 'receipts.js');
const SKILL_MARK = '<!-- receipts:managed -->';
const MD_START = '<!-- receipts:start -->';
const MD_END = '<!-- receipts:end -->';

interface Manifest {
  createdConfig?: boolean;
  createdGitignore?: boolean;
  addedGitignoreLine?: boolean;
  /** Files init created from nothing (project-relative). */
  createdFiles?: string[];
  agents?: string[];
}
const manifestPath = (cwd: string) => path.join(cwd, '.receipts', 'install.json');
const readJson = (f: string): any => {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
};
const rel = (cwd: string, f: string) => path.relative(cwd, f).split(path.sep).join('/');

// ---- hook definitions ------------------------------------------------------

type HookMap = Record<string, { matcher?: string; hooks: Record<string, unknown>[] }[]>;
type HookAgent = 'claude' | 'codex' | 'gemini';

/** Where each agent reads project-level hooks from. */
export const HOOK_FILES: Record<HookAgent, string> = {
  claude: '.claude/settings.json',
  codex: '.codex/hooks.json',
  gemini: '.gemini/settings.json',
};

function projectRelative(cwd: string, hookJs: string): string | null {
  const r = path.relative(cwd, hookJs);
  return !r.startsWith('..') && !path.isAbsolute(r) && r.split(path.sep)[0] === 'node_modules' ? r.split(path.sep).join('/') : null;
}

export function agentHooks(agent: HookAgent, cwd: string, hookJs = HOOK_JS): HookMap {
  const inProject = projectRelative(cwd, hookJs);
  if (agent === 'claude') {
    const script = inProject ? '${CLAUDE_PROJECT_DIR}/' + inProject : hookJs;
    const h = (kind: string, timeout: number) => ({ type: 'command', command: 'node', args: [script, 'claude', kind, MARKER], timeout });
    return {
      SessionStart: [{ hooks: [h('session', 10)] }],
      UserPromptSubmit: [{ hooks: [h('prompt', 10)] }],
      PostToolUse: [{ matcher: 'Bash|WebFetch', hooks: [h('ledger', 10)] }],
      PostToolUseFailure: [{ matcher: 'Bash', hooks: [h('ledger', 10)] }],
      Stop: [{ hooks: [h('stop', 15)] }],
    };
  }
  if (agent === 'codex') {
    // Codex hook timeouts are in seconds. No documented project-dir variable, so the path is absolute.
    const h = (kind: string, timeout: number) => ({ type: 'command', command: `node "${hookJs}" codex ${kind} ${MARKER}`, timeout });
    return {
      SessionStart: [{ hooks: [h('session', 10)] }],
      UserPromptSubmit: [{ hooks: [h('prompt', 10)] }],
      PostToolUse: [{ matcher: '^Bash$', hooks: [h('ledger', 10)] }],
      Stop: [{ hooks: [h('stop', 15)] }],
    };
  }
  // Gemini hook timeouts are in milliseconds; GEMINI_PROJECT_DIR is documented.
  const script = inProject ? '$GEMINI_PROJECT_DIR/' + inProject : hookJs;
  const h = (kind: string, timeout: number) => ({ type: 'command', command: `node "${script}" gemini ${kind} ${MARKER}`, timeout });
  return {
    SessionStart: [{ hooks: [h('session', 10000)] }],
    BeforeAgent: [{ hooks: [h('prompt', 10000)] }],
    AfterTool: [{ matcher: 'run_shell_command|web_fetch', hooks: [h('ledger', 10000)] }],
    AfterAgent: [{ hooks: [h('stop', 15000)] }],
  };
}

/** Kept for callers that only care about Claude Code. */
export const claudeHooks = (cwd: string, hookJs = HOOK_JS) => agentHooks('claude', cwd, hookJs);

const isOurs = (hook: any) => (Array.isArray(hook?.args) && hook.args.includes(MARKER)) || (typeof hook?.command === 'string' && hook.command.includes(MARKER));

// ---- init ------------------------------------------------------------------

export interface InitOptions {
  cwd: string;
  agents?: Agent[];
  hookJs?: string;
  dryRun?: boolean;
}

function mdBlock(text: string): string {
  return `${MD_START}\n${text.trim()}\n${MD_END}\n`;
}

/** Installs Receipts at project level. Returns a human-readable line per change. */
export function init(o: InitOptions): string[] {
  const { cwd } = o;
  const agents = o.agents?.length ? o.agents : (['claude'] as Agent[]);
  const hookJs = o.hookJs ?? HOOK_JS;
  const changes: string[] = [];
  const m: Manifest = readJson(manifestPath(cwd)) ?? {};
  m.createdFiles ??= [];
  const write = (f: string, text: string) => {
    if (!o.dryRun) {
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, text);
    }
  };
  const created = (f: string) => {
    const r = rel(cwd, f);
    if (!m.createdFiles!.includes(r)) m.createdFiles!.push(r);
  };

  // 1. config
  const cfgFile = path.join(cwd, '.receipts.json');
  if (!fs.existsSync(cfgFile)) {
    const d = detectCommands(cwd);
    const cfg: Record<string, unknown> = { mode: 'warn' };
    if (d.test) cfg.testCommand = d.test;
    if (d.build) cfg.buildCommand = d.build;
    write(cfgFile, JSON.stringify(cfg, null, 2) + '\n');
    m.createdConfig = true;
    changes.push(`created .receipts.json (${JSON.stringify(cfg)}); mode "warn" reports only, set "block" to send the agent back once per turn`);
  } else changes.push('kept existing .receipts.json');

  // 2. .gitignore
  const gi = path.join(cwd, '.gitignore');
  const giText = fs.existsSync(gi) ? fs.readFileSync(gi, 'utf8') : null;
  if (giText === null) {
    write(gi, '.receipts/\n');
    m.createdGitignore = true;
    changes.push('created .gitignore with .receipts/');
  } else if (!/^\/?\.receipts\/?\s*$/m.test(giText)) {
    write(gi, giText + (giText.endsWith('\n') || !giText ? '' : '\n') + '.receipts/\n');
    m.addedGitignoreLine = true;
    changes.push('added .receipts/ to .gitignore');
  }

  // 3. hooks for Claude Code / Codex / Gemini
  for (const agent of agents.filter((a): a is HookAgent => a === 'claude' || a === 'codex' || a === 'gemini')) {
    const file = path.join(cwd, HOOK_FILES[agent]);
    const existing = fs.existsSync(file) ? readJson(file) : undefined;
    if (existing === null) throw new Error(`${HOOK_FILES[agent]} is not valid JSON; fix it and re-run`);
    const settings = existing ?? {};
    settings.hooks ??= {};
    const ours = agentHooks(agent, cwd, hookJs);
    for (const [ev, entries] of Object.entries(ours)) {
      const list: any[] = (settings.hooks[ev] ??= []);
      for (const e of list) e.hooks = (e.hooks ?? []).filter((x: unknown) => !isOurs(x));
      settings.hooks[ev] = list.filter((e) => e.hooks.length);
      settings.hooks[ev].push(...entries);
    }
    if (existing === undefined) created(file);
    write(file, JSON.stringify(settings, null, 2) + '\n');
    changes.push(`${existing === undefined ? 'created' : 'updated'} ${HOOK_FILES[agent]}: hooks ${Object.keys(ours).join(', ')}`);
    if (agent === 'codex') changes.push('Codex: run /hooks in Codex and trust the Receipts hooks, or they will not run');
    if (agent === 'gemini') changes.push('Gemini CLI: project hooks are fingerprinted; approve them on first run');
  }
  if (/[\\/]_npx[\\/]/.test(hookJs)) {
    changes.push('WARNING: hooks point into the npx cache, which may be cleaned. Install @receipts/cli as a devDependency or globally and re-run init.');
  }

  // 4. Claude Code skill
  if (agents.includes('claude')) {
    const skillDst = path.join(cwd, '.claude', 'skills', 'receipts', 'SKILL.md');
    if (!fs.existsSync(skillDst) && fs.existsSync(SKILL_SRC)) {
      write(skillDst, fs.readFileSync(SKILL_SRC, 'utf8') + '\n' + SKILL_MARK + '\n');
      created(skillDst);
      changes.push('created .claude/skills/receipts/SKILL.md');
    }
  }

  // 5. OpenCode: plugin + rules block in AGENTS.md (no session-start context hook)
  if (agents.includes('opencode')) {
    const plugin = path.join(cwd, '.opencode', 'plugins', 'receipts.js');
    if (fs.existsSync(OPENCODE_PLUGIN_SRC)) {
      const src = fs.readFileSync(OPENCODE_PLUGIN_SRC, 'utf8').replace('"__RECEIPTS_HOOK__"', JSON.stringify(hookJs));
      if (!fs.existsSync(plugin)) created(plugin);
      write(plugin, src);
      changes.push('wrote .opencode/plugins/receipts.js');
    }
    const agentsMd = path.join(cwd, 'AGENTS.md');
    const rules = fs.existsSync(RULES_SRC) ? fs.readFileSync(RULES_SRC, 'utf8') : '';
    const cur = fs.existsSync(agentsMd) ? fs.readFileSync(agentsMd, 'utf8') : null;
    if (rules && (cur === null || !cur.includes(MD_START))) {
      if (cur === null) created(agentsMd);
      write(agentsMd, (cur === null ? '' : cur + (cur.endsWith('\n') ? '\n' : '\n\n')) + mdBlock(rules));
      changes.push(`${cur === null ? 'created' : 'added a Receipts rules block to'} AGENTS.md`);
    }
  }

  m.agents = [...new Set([...(m.agents ?? []), ...agents])];
  if (!o.dryRun) write(manifestPath(cwd), JSON.stringify(m));
  return changes;
}

// ---- uninstall -------------------------------------------------------------

function removeHooks(file: string, label: string, createdByUs: boolean, cwd: string, changes: string[]): void {
  const s = readJson(file);
  if (!s?.hooks) return;
  let removed = 0;
  for (const ev of Object.keys(s.hooks)) {
    for (const e of s.hooks[ev]) {
      const before = e.hooks?.length ?? 0;
      e.hooks = (e.hooks ?? []).filter((x: unknown) => !isOurs(x));
      removed += before - e.hooks.length;
    }
    s.hooks[ev] = s.hooks[ev].filter((e: any) => e.hooks.length);
    if (!s.hooks[ev].length) delete s.hooks[ev];
  }
  if (!Object.keys(s.hooks).length) delete s.hooks;
  if (!removed) return;
  if (createdByUs && !Object.keys(s).length) {
    fs.rmSync(file);
    changes.push(`removed ${label} (it was created by init)`);
    try {
      fs.rmdirSync(path.dirname(file));
    } catch {
      /* not empty */
    }
  } else {
    fs.writeFileSync(file, JSON.stringify(s, null, 2) + '\n');
    changes.push(`removed ${removed} Receipts hook(s) from ${label}`);
  }
  void cwd;
}

/** Reverses init. Returns a line per change. */
export function uninstall(o: { cwd: string; keepData?: boolean }): string[] {
  const { cwd } = o;
  const changes: string[] = [];
  const m: Manifest = readJson(manifestPath(cwd)) ?? {};
  const made = new Set(m.createdFiles ?? []);

  for (const agent of Object.keys(HOOK_FILES) as HookAgent[]) {
    removeHooks(path.join(cwd, HOOK_FILES[agent]), HOOK_FILES[agent], made.has(HOOK_FILES[agent]), cwd, changes);
  }

  const skill = path.join(cwd, '.claude', 'skills', 'receipts', 'SKILL.md');
  if (fs.existsSync(skill) && fs.readFileSync(skill, 'utf8').includes(SKILL_MARK)) {
    fs.rmSync(path.dirname(skill), { recursive: true });
    changes.push('removed .claude/skills/receipts');
    for (const d of [path.join(cwd, '.claude', 'skills'), path.join(cwd, '.claude')]) {
      try {
        fs.rmdirSync(d);
      } catch {
        /* not empty */
      }
    }
  }

  const plugin = path.join(cwd, '.opencode', 'plugins', 'receipts.js');
  if (fs.existsSync(plugin) && fs.readFileSync(plugin, 'utf8').startsWith('// receipts:managed')) {
    fs.rmSync(plugin);
    changes.push('removed .opencode/plugins/receipts.js');
    for (const d of [path.join(cwd, '.opencode', 'plugins'), path.join(cwd, '.opencode')]) {
      try {
        fs.rmdirSync(d);
      } catch {
        /* not empty */
      }
    }
  }

  const agentsMd = path.join(cwd, 'AGENTS.md');
  if (fs.existsSync(agentsMd)) {
    const t = fs.readFileSync(agentsMd, 'utf8');
    if (t.includes(MD_START)) {
      const stripped = t.replace(new RegExp(`\\n?${MD_START}[\\s\\S]*?${MD_END}\\n?`), '');
      if (made.has('AGENTS.md') && !stripped.trim()) {
        fs.rmSync(agentsMd);
        changes.push('removed AGENTS.md (it was created by init)');
      } else {
        fs.writeFileSync(agentsMd, stripped);
        changes.push('removed the Receipts rules block from AGENTS.md');
      }
    }
  }

  const gi = path.join(cwd, '.gitignore');
  if (fs.existsSync(gi) && (m.createdGitignore || m.addedGitignoreLine)) {
    const t = fs.readFileSync(gi, 'utf8').replace(/^\.receipts\/\n?/m, '');
    if (m.createdGitignore && !t.trim()) {
      fs.rmSync(gi);
      changes.push('removed .gitignore (it was created by init)');
    } else {
      fs.writeFileSync(gi, t);
      changes.push('removed .receipts/ from .gitignore');
    }
  }
  if (m.createdConfig && fs.existsSync(path.join(cwd, '.receipts.json'))) {
    fs.rmSync(path.join(cwd, '.receipts.json'));
    changes.push('removed .receipts.json (it was created by init)');
  }
  if (!o.keepData && fs.existsSync(path.join(cwd, '.receipts'))) {
    fs.rmSync(path.join(cwd, '.receipts'), { recursive: true });
    changes.push('removed .receipts/ (ledger, state, reports)');
  }
  if (!changes.length) changes.push('nothing to remove');
  return changes;
}

/** Agents whose CLI is on PATH. */
export function detectAgents(env: NodeJS.ProcessEnv = process.env): Agent[] {
  const dirs = (env.PATH ?? '').split(path.delimiter).filter(Boolean);
  const exts = process.platform === 'win32' ? ['', '.exe', '.cmd', '.bat'] : [''];
  const bins: Record<Agent, string> = { claude: 'claude', codex: 'codex', gemini: 'gemini', opencode: 'opencode' };
  return (Object.keys(bins) as Agent[]).filter((a) => dirs.some((d) => exts.some((x) => fs.existsSync(path.join(d, bins[a] + x)))));
}
