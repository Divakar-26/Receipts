import test from 'node:test'
import assert from 'node:assert/strict'
import { clearCart } from '../src/cart.ts'

test('clearCart returns a new empty array and leaves the input alone', () => {
  const items = [{ price: 1, qty: 1 }]
  assert.deepEqual(clearCart(items), [])
  assert.equal(items.length, 1)
})
