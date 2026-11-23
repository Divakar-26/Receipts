import test from 'node:test'
import assert from 'node:assert/strict'
import { canAdd } from '../../src/limits.ts'
import { legacyCanAdd } from '../../src/legacy/limits.ts'

test('canAdd stops at the limit', () => assert.equal(canAdd(10), false))
test('legacyCanAdd stops at the limit', () => assert.equal(legacyCanAdd(10), false))
