import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { addTax } from '../src/pricing.ts'

test('renamed', () => {
  assert.equal(addTax(100), 107)
  assert.equal(execFileSync('node', ['scripts/quote.ts']).toString().trim(), '53.5')
})
