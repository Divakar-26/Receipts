import test from 'node:test'
import assert from 'node:assert/strict'
import { handle } from '../../src/router.ts'

test('routes by name', () => {
  assert.equal(handle('/price', 5), '$5.00')
  assert.equal(handle('/discount', 200, 25), 150)
})
