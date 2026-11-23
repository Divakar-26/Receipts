import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'

test('legacy.ts is gone', () => assert.ok(!fs.existsSync('src/legacy.ts')))
test('the report still runs', () => assert.equal(execFileSync('node', ['scripts/report.ts']).toString().trim(), '3'))
