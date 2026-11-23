import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'

test('the quote script prints the taxed price', () => assert.equal(execFileSync('node', ['scripts/quote.ts']).toString().trim(), '53.5'))
