import assert from 'node:assert/strict'
import { findBursts, currentBurst, densityBuckets } from '../src/lib/danmakuBursts.ts'

const s = (...seconds) => seconds.map((x) => x * 1000)

assert.deepEqual(findBursts([]), [])
assert.equal(findBursts(s(0, 2, 4, 6)).length, 1)
assert.deepEqual(findBursts(s(0, 2, 4))[0], { start: 0, end: 4000, count: 3 })

// A minute of quiet is the boundary, and it is inclusive: exactly 60s is still
// the same wave, a hair over starts a new one.
assert.equal(findBursts(s(0, 60)).length, 1)
assert.equal(findBursts(s(0, 61)).length, 2)
assert.equal(findBursts(s(0, 2, 4, 95, 97, 99)).length, 2)

// The trailing 謝謝老師: alone it is a burst of one, which would leave the cloud
// showing a single word, so it reaches back and takes the wave before it.
assert.equal(currentBurst(s(0, 1, 2, 3, 4, 5, 6, 200)).count, 8)
// A wave big enough to be an answer stands on its own.
assert.equal(currentBurst(s(0, 1, 2, 3, 4, 200, 201, 202, 203, 204)).count, 5)
assert.equal(currentBurst([]), null)
// Nothing before it to borrow from.
assert.equal(currentBurst(s(0)).count, 1)

// Five buckets over ten seconds is two seconds each, so 2s is the second
// bucket, not the first.
assert.deepEqual(densityBuckets(s(0, 1, 2, 8, 9), 0, 10_000, 5), [2, 1, 0, 0, 2])
assert.deepEqual(densityBuckets(s(-5, 100), 0, 10_000, 2), [0, 0])
// The last message lands in the final bucket rather than past the end of it.
assert.deepEqual(densityBuckets(s(10), 0, 10_000, 4), [0, 0, 0, 1])

const times = s(5, 1, 3)
findBursts(times)
assert.deepEqual(times, s(5, 1, 3))

console.log('PASS: empty, one wave, the 60s boundary either side, a trailing single message borrowing the wave before it, a wave that stands alone, bucket edges, and times left unsorted.')
