import * as fs from 'node:fs';
import * as path from 'node:path';
import { Claim, Result } from '../types.js';
import { Ctx, mk, unverified } from './ctx.js';

interface Found {
  file: string;
  line?: number;
  version?: string;
  /** Go: `require x v1 // indirect`, listed in go.mod but not used directly by the module. */
  indirect?: boolean;
}
export interface DepResult {
  declared: Found[];
  locked: Found[];
  manifests: string[];
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pyNorm = (s: string) => s.toLowerCase().replace(/[-_.]+/g, '-');
const MANIFESTS = new Set([
  'package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'pyproject.toml', 'uv.lock', 'poetry.lock', 'go.mod', 'go.sum',
  'Cargo.toml', 'Cargo.lock', 'pom.xml', 'build.gradle', 'build.gradle.kts',
]);

function findFiles(root: string, maxDepth = 2): string[] {
  const out: string[] = [];
  const walk = (dir: string, depth: number) => {
    let ents: fs.Dirent[];
    try {
      ents = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      if (e.isDirectory()) {
        if (depth < maxDepth && !['node_modules', '.git', '.receipts', 'dist', 'target', 'vendor', '.venv', 'venv'].includes(e.name)) walk(path.join(dir, e.name), depth + 1);
      } else if (MANIFESTS.has(e.name) || /^requirements.*\.txt$/.test(e.name)) out.push(path.relative(root, path.join(dir, e.name)).split(path.sep).join('/'));
    }
  };
  walk(root, 0);
  return out.sort();
}

const lineOf = (text: string, re: RegExp): number | undefined => {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) if (re.test(lines[i])) return i + 1;
  return undefined;
};

export function findDependency(root: string, name: string): DepResult {
  const res: DepResult = { declared: [], locked: [], manifests: [] };
  for (const rel of findFiles(root)) {
    let text: string;
    try {
      const st = fs.statSync(path.join(root, rel));
      if (st.size > 20 * 1024 * 1024) continue;
      text = fs.readFileSync(path.join(root, rel), 'utf8');
    } catch {
      continue;
    }
    res.manifests.push(rel);
    const base = path.basename(rel);
    const n = esc(name);
    if (base === 'package.json') {
      try {
        const j = JSON.parse(text);
        for (const sec of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
          const v = j[sec]?.[name];
          if (typeof v === 'string') res.declared.push({ file: rel, line: lineOf(text, new RegExp(`^\\s*"${n}"\\s*:`)), version: v });
        }
      } catch {
        /* ignore */
      }
    } else if (base === 'package-lock.json') {
      try {
        const j = JSON.parse(text);
        for (const [k, v] of Object.entries<{ version?: string }>(j.packages ?? {})) {
          if (k === `node_modules/${name}` || k.endsWith(`/node_modules/${name}`)) {
            res.locked.push({ file: rel, version: v.version });
            break;
          }
        }
        const dv = j.dependencies?.[name];
        if (dv && !res.locked.some((l) => l.file === rel)) res.locked.push({ file: rel, version: dv.version });
      } catch {
        /* ignore */
      }
    } else if (base === 'yarn.lock') {
      const m = new RegExp(`^"?${n}@[^\\n]*:\\s*\\n(?:\\s+[^\\n]*\\n)*?\\s+version:? "?([^"\\n]+)"?`, 'm').exec(text);
      if (m) res.locked.push({ file: rel, version: m[1] });
    } else if (base === 'pnpm-lock.yaml') {
      const m = new RegExp(`(?:^|[\\s'/])${n}@([\\w.\\-+]+)`, 'm').exec(text);
      if (m) res.locked.push({ file: rel, version: m[1] });
      else if (new RegExp(`^\\s+'?${n}'?:\\s*$`, 'm').test(text)) res.locked.push({ file: rel });
    } else if (/^requirements.*\.txt$/.test(base)) {
      const lines = text.split('\n');
      lines.forEach((l, i) => {
        const m = /^\s*([A-Za-z0-9][A-Za-z0-9._-]*)\s*(?:\[[^\]]*\])?\s*((?:[=<>!~]=?|===)[^;#\s]*)?/.exec(l);
        if (m && !l.trim().startsWith('#') && pyNorm(m[1]) === pyNorm(name)) res.declared.push({ file: rel, line: i + 1, version: m[2]?.replace(/^==/, '') });
      });
    } else if (base === 'pyproject.toml') {
      const lines = text.split('\n');
      lines.forEach((l, i) => {
        if (l.trim().startsWith('#')) return;
        for (const qm of l.matchAll(/["']([^"'\n]+)["']/g)) {
          const q = /^([A-Za-z0-9][A-Za-z0-9._-]*)\s*(?:\[[^\]]*\])?\s*([<>=!~][^;]*)?/.exec(qm[1]);
          if (q && pyNorm(q[1]) === pyNorm(name) && !/^\s*(?:name|version|description|requires-python)\s*=/.test(l)) {
            res.declared.push({ file: rel, line: i + 1, version: q[2]?.trim().replace(/^==/, '') || undefined });
          }
        }
        const t = /^\s*([A-Za-z0-9][A-Za-z0-9._-]*)\s*=\s*(?:"([^"]*)"|\{[^}]*version\s*=\s*"([^"]*)")/.exec(l);
        if (t && pyNorm(t[1]) === pyNorm(name) && t[1] !== 'python') res.declared.push({ file: rel, line: i + 1, version: t[2] ?? t[3] });
      });
    } else if (base === 'uv.lock' || base === 'poetry.lock' || base === 'Cargo.lock') {
      const re = /^name = "([^"]+)"\s*\n(?:[^\n]*\n)??version = "([^"]+)"/gm;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text))) if ((base === 'Cargo.lock' ? m[1] === name : pyNorm(m[1]) === pyNorm(name))) res.locked.push({ file: rel, version: m[2] });
    } else if (base === 'go.mod') {
      text.split('\n').forEach((l, i) => {
        const m = /^\s*(?:require\s+)?(\S+)\s+(v\S+)/.exec(l);
        if (m && (m[1] === name || m[1].endsWith('/' + name))) {
          if (/\/\/\s*indirect\b/.test(l)) res.locked.push({ file: rel, line: i + 1, version: m[2], indirect: true });
          else res.declared.push({ file: rel, line: i + 1, version: m[2] });
        }
      });
    } else if (base === 'go.sum') {
      const m = new RegExp(`^(\\S*${n})\\s+(v\\S+?)(?:/go.mod)?\\s`, 'm').exec(text);
      if (m && (m[1] === name || m[1].endsWith('/' + name))) res.locked.push({ file: rel, version: m[2] });
    } else if (base === 'Cargo.toml') {
      let section = '';
      text.split('\n').forEach((l, i) => {
        const h = /^\s*\[([^\]]+)\]/.exec(l);
        if (h) {
          section = h[1];
          const d = /^(?:dev-|build-)?dependencies\.(.+)$/.exec(section);
          if (d && d[1] === name) res.declared.push({ file: rel, line: i + 1 });
          return;
        }
        if (/^(?:dev-|build-)?dependencies$/.test(section) || /\.dependencies$/.test(section)) {
          const m = new RegExp(`^\\s*${n}\\s*=\\s*(?:"([^"]*)"|\\{[^}]*version\\s*=\\s*"([^"]*)")?`).exec(l);
          if (m) res.declared.push({ file: rel, line: i + 1, version: m[1] ?? m[2] });
        }
      });
    } else if (base === 'pom.xml') {
      const m = new RegExp(`<artifactId>\\s*${n}\\s*</artifactId>(?:\\s*<version>([^<]+)</version>)?`).exec(text);
      if (m) res.declared.push({ file: rel, line: lineOf(text, new RegExp(`<artifactId>\\s*${n}\\s*</artifactId>`)), version: m[1] });
    } else if (base.startsWith('build.gradle')) {
      const re = new RegExp(`["'][\\w.\\-]+:${n}(?::([^"']*))?["']`);
      const line = lineOf(text, re);
      if (line) res.declared.push({ file: rel, line, version: re.exec(text)?.[1] });
    }
  }
  return res;
}

const stripV = (v: string) => v.replace(/^[\s^~>=<v]+/, '').trim();

export function verifyDep(c: Claim, ctx: Ctx): Result {
  const name = c.fields.name;
  if (!/^[@\w./-]{1,214}$/.test(name)) return unverified(c, 'invalid', `package name \`${name.slice(0, 40)}\` rejected`);
  const r = findDependency(ctx.root, name);
  const NOTE = 'declared, not checked as installed';
  if (!r.manifests.length) return unverified(c, 'unchecked', 'no dependency manifest found', NOTE);
  const claimedV = c.fields.version ? stripV(c.fields.version) : '';
  if (r.declared.length) {
    const d = r.declared[0];
    const where = `${d.file}${d.line ? ':' + d.line : ''}`;
    if (claimedV) {
      const have = [...r.declared, ...r.locked].map((x) => (x.version ? stripV(x.version) : '')).filter(Boolean);
      if (have.length && !have.some((h) => h === claimedV || h.startsWith(claimedV + '.') || claimedV.startsWith(h))) {
        return mk(c, 'CONTRADICTED', `\`${name}\` is declared at ${where} as ${d.version ?? '?'}, not ${c.fields.version}`, NOTE);
      }
    }
    return mk(c, 'VERIFIED', `${where} (declared${d.version ? ' ' + d.version : ''})`, NOTE, r.declared.map((x) => `${x.file}${x.line ? ':' + x.line : ''} ${x.version ?? ''}`.trim()));
  }
  if (r.locked.some((l) => l.indirect)) {
    const l = r.locked.find((x) => x.indirect)!;
    return unverified(c, 'unprovable', `\`${name}\` is only an indirect requirement (${l.file}:${l.line}, \`// indirect\`), not a direct dependency`, 'go marks a requirement indirect when no package in the module imports it directly', r.locked.map((x) => `${x.file}${x.line ? ':' + x.line : ''} ${x.version ?? ''}`.trim()));
  }
  if (r.locked.length) {
    return unverified(c, 'unprovable', `\`${name}\` is only in ${r.locked[0].file} (transitive?), not declared by the project`, 'a lockfile entry may be a transitive dependency; the manifest does not list it', r.locked.map((x) => `${x.file} ${x.version ?? ''}`.trim()));
  }
  return mk(c, 'CONTRADICTED', `\`${name}\` not found in ${r.manifests.join(', ')}`, NOTE);
}
