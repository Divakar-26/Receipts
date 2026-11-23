import test from 'node:test'
import assert from 'node:assert/strict'
import { checkoutTotal } from '../../src/checkout.ts'

test('checkout total includes tax', () => assert.equal(checkoutTotal([{ price: 100, qty: 1 }]), 107))
