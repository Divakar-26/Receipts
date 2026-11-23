import test from 'node:test'
import assert from 'node:assert/strict'
import { invoiceTotal } from '../../src/legacy/invoice.ts'

test('invoice total', () => assert.equal(invoiceTotal(100), 107))
