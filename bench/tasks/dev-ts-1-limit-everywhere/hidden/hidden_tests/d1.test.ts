import test from 'node:test'
import assert from 'node:assert/strict'
import { canAdd } from '../src/limits.ts'
import { legacyCanAdd } from '../src/legacy/limits.ts'

test('limit is 20', () => {
  assert.equal(canAdd(19), true)
  assert.equal(canAdd(20), false)
  assert.equal(legacyCanAdd(19), true)
})
