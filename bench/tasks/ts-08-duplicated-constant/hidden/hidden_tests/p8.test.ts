import test from 'node:test'
import assert from 'node:assert/strict'
import { withTax } from '../src/pricing.ts'
import { legacyWithTax } from '../src/legacy/tax.ts'

test('both are 8%', () => {
  assert.equal(withTax(100), 108)
  assert.equal(legacyWithTax(100), 108)
})
