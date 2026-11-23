import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateDiscount } from '../src/pricing.ts'
import { nightly } from '../src/jobs.ts'

test('renamed and the job still works', () => {
  assert.equal(calculateDiscount(200, 25), 150)
  assert.equal(nightly(), 150)
})
