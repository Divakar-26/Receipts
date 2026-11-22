import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectCommands } from '../core/index.js';

export const MARKER = '--receipts';
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const HOOK_JS = path.join(HERE, 'hook.js');
export const SKILL_SRC = path.join(HERE, '..', '..', 'skill', 'SKILL.md');
const SKILL_MARK = '<!-- receipts:managed -->';

interface Manifest {
  createdConfig?: boolean;
  createdGitignore?: boolean;
  addedGitignoreLine?: boolean;
  createdSettings?: boolean;
  createdSkill?: boolean;
}
const manifestPath = (cwd: string) => path.join(cwd, '.receipts', 'install.json');
const readJson = (f: string): any => {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
};

function hookCommand(cwd: string, hookJs: string): string {
  const rel = path.relative(cwd, hookJs);
  if (!rel.startsWith('..') && !path.isAbsolute(rel) && rel.split(path.sep)[0] === 'node_modules') {
    return '${CLAUDE_PROJECT_DIR}/' + rel.split(path.sep).join('/');
  }
  return hookJs;
}

export function claudeHooks(cwd: string, hookJs = HOOK_JS) {
  const script = hookCommand(cwd, hookJs);
  const h = (kind: string, timeout: number) => ({ type: 'command', command: 'node', args: [script, 'claude', kind, MARKER], timeout });
  return {
    SessionStart: [{ hooks: [h('session', 10)] }],
    UserPromptSubmit: [{ hooks: [h('prompt', 10)] }],
    PostToolUse: [{ matcher: 'Bash|WebFetch', hooks: [h('ledger', 10)] }],
    PostToolUseFailure: [{ matcher: 'Bash', hooks: [h('ledger', 10)] }],
    Stop: [{ hooks: [h('stop', 15)] }],
  } as Record<string, { matcher?: string; hooks: Record<string, unknown>[] }[]>;
}

const isOurs = (hook: any) => Array.isArray(hook?.args) && hook.args.includes(MARKER);

export interface InitOptions {
  cwd: string;
  hookJs?: string;
  dryRun?: boolean;
}

/** Installs Receipts at project level. Returns a human-readable line per change. */
export function init(o: InitOptions): string[] {
  const { cwd } = o;
  const changes: string[] = [];
  const m: Manifest = readJson(manifestPath(cwd)) ?? {};
  const write = (f: string, text: string) => {
    if (!o.dryRun) {
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, text);
    }
  };

  // 1. config
  const cfgFile = path.join(cwd, '.receipts.json');
  if (!fs.existsSync(cfgFile)) {
    const d = detectCommands(cwd);
    const cfg: Record<string, unknown> = { mode: 'block' };
    if (d.test) cfg.testCommand = d.test;
    if (d.build) cfg.buildCommand = d.build;
    write(cfgFile, JSON.stringify(cfg, null, 2) + '\n');
    m.createdConfig = true;
    changes.push(`created .receipts.json (${JSON.stringify(cfg)})`);
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

  // 3. Claude Code hooks (.claude/settings.json)
  const sFile = path.join(cwd, '.claude', 'settings.json');
  const existing = fs.existsSync(sFile) ? readJson(sFile) : undefined;
  if (existing === null) throw new Error(`${sFile} is not valid JSON; fix it and re-run`);
  const settings = existing ?? {};
  settings.hooks ??= {};
  const ours = claudeHooks(cwd, o.hookJs);
  for (const [ev, entries] of Object.entries(ours)) {
    const list: any[] = (settings.hooks[ev] ??= []);
    for (const e of list) e.hooks = (e.hooks ?? []).filter((x: unknown) => !isOurs(x));
    settings.hooks[ev] = list.filter((e) => e.hooks.length);
    settings.hooks[ev].push(...entries);
  }
  if (existing === undefined) m.createdSettings = true;
  write(sFile, JSON.stringify(settings, null, 2) + '\n');
  changes.push(`${existing === undefined ? 'created' : 'updated'} .claude/settings.json: hooks ${Object.keys(ours).join(', ')}`);
  if (/[\\/]_npx[\\/]/.test(o.hookJs ?? HOOK_JS)) {
    changes.push('WARNING: hooks point into the npx cache, which may be cleaned. Install @receipts/cli as a devDependency or globally and re-run init.');
  }

  // 4. skill
  const skillDst = path.join(cwd, '.claude', 'skills', 'receipts', 'SKILL.md');
  if (!fs.existsSync(skillDst) && fs.existsSync(SKILL_SRC)) {
    write(skillDst, fs.readFileSync(SKILL_SRC, 'utf8') + '\n' + SKILL_MARK + '\n');
    m.createdSkill = true;
    changes.push('created .claude/skills/receipts/SKILL.md');
  }

  if (!o.dryRun) write(manifestPath(cwd), JSON.stringify(m));
  return changes;
}

/** Reverses init. Returns a line per change. */
export function uninstall(o: { cwd: string; keepData?: boolean }): string[] {
  const { cwd } = o;
  const changes: string[] = [];
  const m: Manifest = readJson(manifestPath(cwd)) ?? {};
  const sFile = path.join(cwd, '.claude', 'settings.json');
  const s = readJson(sFile);
  if (s?.hooks) {
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
    if (removed) {
      if (m.createdSettings && !Object.keys(s).length) {
        fs.rmSync(sFile);
        changes.push('removed .claude/settings.json (it was created by init)');
        try {
          fs.rmdirSync(path.join(cwd, '.claude'));
        } catch {
          /* not empty */
        }
      } else {
        fs.writeFileSync(sFile, JSON.stringify(s, null, 2) + '\n');
        changes.push(`removed ${removed} Receipts hook(s) from .claude/settings.json`);
      }
    }
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
