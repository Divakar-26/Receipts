import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'

test('the report script runs', () => assert.equal(execFileSync('node', ['scripts/report.ts']).toString().trim(), '3'))
