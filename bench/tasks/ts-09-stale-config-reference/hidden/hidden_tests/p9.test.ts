import test from 'node:test'
import assert from 'node:assert/strict'
import { renderPrice } from '../src/pricing.ts'
import { handle } from '../src/router.ts'

test('renamed and routed', () => {
  assert.equal(renderPrice(5), '$5.00')
  assert.equal(handle('/price', 5), '$5.00')
})
