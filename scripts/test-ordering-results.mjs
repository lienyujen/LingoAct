import assert from 'node:assert/strict'
import { orderingRanking } from '../src/lib/orderingResults.ts'
const options = ['A', 'B', 'C']
assert.deepEqual(orderingRanking(options, []).map(x => x.agreement), [0, 0, 0])
assert.deepEqual(orderingRanking(options, [options, options]).map(x => x.agreement), [100, 100, 100])
const split = orderingRanking(options, [['C', 'A', 'B'], ['C', 'B', 'A']])
assert.deepEqual(split.map(x => x.item), ['C', 'A', 'B'])
assert.deepEqual(split.map(x => x.agreement), [100, 50, 50])
assert.deepEqual(options, ['A', 'B', 'C'])
console.log('PASS: empty, unanimous, mean-position order, stable ties, agreement after sorting, immutable options.')
