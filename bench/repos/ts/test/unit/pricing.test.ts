import test from 'node:test'
import assert from 'node:assert/strict'
import { applyDiscount, formatPrice, withTax } from '../../src/pricing.ts'

test('applyDiscount takes a percentage off', () => assert.equal(applyDiscount(200, 25), 150))
test('formatPrice shows two decimals', () => assert.equal(formatPrice(5), '$5.00'))
test('withTax adds 7%', () => assert.equal(withTax(100), 107))
