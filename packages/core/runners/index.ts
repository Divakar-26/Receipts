import { TestSummary } from '../types.js';
import { stripAnsi, Parser } from './util.js';
import { jest } from './jest.js';
import { vitest } from './vitest.js';
import { mocha } from './mocha.js';
import { nodetest } from './nodetest.js';
import { pytest } from './pytest.js';
import { unittest } from './unittest.js';
import { gotest } from './gotest.js';
import { cargo } from './cargo.js';
import { surefire } from './surefire.js';
import { rspec } from './rspec.js';
import { phpunit } from './phpunit.js';

/** Order matters only where output formats could overlap; each format is distinctive. */
export const PARSERS: Record<string, Parser> = { jest, vitest, mocha, nodetest, pytest, unittest, gotest, cargo, surefire, rspec, phpunit };

export function parseSummary(output: string): TestSummary | null {
  const text = stripAnsi(output);
  for (const p of Object.values(PARSERS)) {
    const s = p(text);
    if (s) return s;
  }
  return null;
}
export { stripAnsi };
