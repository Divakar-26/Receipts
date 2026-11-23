import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateDiscount } from '../src/pricing.ts'
import { summaryLine } from '../reports/summary.ts'

test('renamed', () => {
  assert.equal(calculateDiscount(200, 25), 150)
  assert.equal(summaryLine(100, 10), '$90.00')
})
