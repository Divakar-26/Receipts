import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

test('checkout has no debug logging', () => assert.ok(!fs.readFileSync('src/checkout.ts', 'utf8').includes('console.log')))

test('checkout still works', async () => {
  const m = await import('../src/checkout.ts')
  assert.equal(m.checkoutTotal([{ price: 100, qty: 1 }]), 107)
})
