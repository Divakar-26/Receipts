import test from 'node:test'
import assert from 'node:assert/strict'
process.env.SHOP_ENV = 'dev'
const { handle } = await import('../src/router.ts')
const { renderPrice } = await import('../src/pricing.ts')

test('renamed, and dev routing still works', () => {
  assert.equal(renderPrice(5), '$5.00')
  assert.equal(handle('/price', 5), '$5.00')
})
