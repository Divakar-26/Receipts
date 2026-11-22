import * as fs from 'node:fs';
import * as path from 'node:path';
import { Config, DEFAULT_CONFIG, Mode } from './types.js';

const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** Merge a parsed `.receipts.json` over the defaults. Bad values fall back to defaults. */
export function normaliseConfig(raw: unknown): Config {
  const c: Config = { ...DEFAULT_CONFIG, ignore: [], lexicon: { extraUniversal: [], extraJudge: [] } };
  if (!raw || typeof raw !== 'object') return c;
  const r = raw as Record<string, unknown>;
  if (r.mode === 'block' || r.mode === 'warn' || r.mode === 'strict') c.mode = r.mode as Mode;
  if (typeof r.testCommand === 'string' && r.testCommand.trim()) c.testCommand = r.testCommand.trim();
  if (typeof r.buildCommand === 'string' && r.buildCommand.trim()) c.buildCommand = r.buildCommand.trim();
  c.ignore = strArr(r.ignore);
  const lx = (r.lexicon ?? {}) as Record<string, unknown>;
  c.lexicon = { extraUniversal: strArr(lx.extraUniversal), extraJudge: strArr(lx.extraJudge) };
  if (typeof r.maxRetries === 'number' && Number.isFinite(r.maxRetries)) {
    c.maxRetries = Math.max(0, Math.min(2, Math.floor(r.maxRetries)));
  }
  return c;
}

export function loadConfig(cwd: string): Config {
  const p = path.join(cwd, '.receipts.json');
  let text: string;
  try {
    text = fs.readFileSync(p, 'utf8');
  } catch {
    return normaliseConfig(null);
  }
  try {
    return normaliseConfig(JSON.parse(text));
  } catch {
    return normaliseConfig(null);
  }
}

/** Best-effort detection of the project's test and build commands. */
export function detectCommands(cwd: string): { test?: string; build?: string } {
  const out: { test?: string; build?: string } = {};
  const read = (f: string): string | null => {
    try {
      return fs.readFileSync(path.join(cwd, f), 'utf8');
    } catch {
      return null;
    }
  };
  const pkg = read('package.json');
  if (pkg) {
    try {
      const scripts = (JSON.parse(pkg).scripts ?? {}) as Record<string, string>;
      if (scripts.test) out.test = 'npm test';
      if (scripts.build) out.build = 'npm run build';
    } catch {
      /* ignore */
    }
  }
  const make = read('Makefile');
  if (make) {
    if (!out.test && /^test:/m.test(make)) out.test = 'make test';
    if (!out.build && /^build:/m.test(make)) out.build = 'make build';
  }
  if (!out.test) {
    const py = read('pyproject.toml');
    if (py && /pytest/.test(py)) out.test = 'pytest';
    else if (fs.existsSync(path.join(cwd, 'pytest.ini'))) out.test = 'pytest';
  }
  if (fs.existsSync(path.join(cwd, 'go.mod'))) {
    out.test ??= 'go test ./...';
    out.build ??= 'go build ./...';
  }
  if (fs.existsSync(path.join(cwd, 'Cargo.toml'))) {
    out.test ??= 'cargo test';
    out.build ??= 'cargo build';
  }
  return out;
}
