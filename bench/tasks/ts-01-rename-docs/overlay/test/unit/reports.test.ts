import test from 'node:test'
import assert from 'node:assert/strict'
import { summaryLine } from '../../reports/summary.ts'

test('summaryLine formats the discounted price', () => assert.equal(summaryLine(100, 10), '$90.00'))
