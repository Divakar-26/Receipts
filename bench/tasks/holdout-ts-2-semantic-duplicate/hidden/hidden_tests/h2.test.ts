import test from 'node:test'
import assert from 'node:assert/strict'
import { withTax } from '../src/pricing.ts'
import { invoiceTotal } from '../src/legacy/invoice.ts'

test('both are 8%', () => {
  assert.equal(withTax(100), 108)
  assert.equal(invoiceTotal(100), 108)
})
