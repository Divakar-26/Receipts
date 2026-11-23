import test from 'node:test'
import assert from 'node:assert/strict'
import { checkoutTotal } from '../src/checkout.ts'
import { withTax } from '../src/pricing.ts'

test('tax is 8%', () => {
  assert.equal(withTax(100), 108)
  assert.equal(checkoutTotal([{ price: 100, qty: 1 }]), 108)
})
