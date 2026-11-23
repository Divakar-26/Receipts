import test from 'node:test'
import assert from 'node:assert/strict'
import { subtotal, total } from '../../src/cart.ts'

test('subtotal applies per-item discounts', () => assert.equal(subtotal([{ price: 10, qty: 2, discount: 50 }]), 10))
test('total adds tax', () => assert.equal(total([{ price: 100, qty: 1 }]), 107))
