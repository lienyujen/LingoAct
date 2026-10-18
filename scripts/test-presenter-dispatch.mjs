import { test } from 'node:test'
import assert from 'node:assert/strict'
import { captureCrop } from '../src/lib/captureGeometry.ts'
import { createPresenterActivityFocus } from '../src/lib/presenterActivityFocus.ts'
import { createSerializedReload } from '../src/lib/serializedReload.ts'

const selection = { x: 100, y: 80, width: 240, height: 120 }
test('macOS Retina selection includes native menu-bar and horizontal window offsets', () => {
  const crop = captureCrop(selection, { width: 1400, height: 850 },
    { x: 20, y: 25, width: 1400, height: 850 }, { x: 0, y: 0, width: 1440, height: 900 }, { width: 2880, height: 1800 })
  assert.deepEqual(crop, { x: 240, y: 210, width: 480, height: 240 })
})
test('Windows mixed-DPI secondary screens and browser zoom map to the selected display', () => {
  assert.deepEqual(captureCrop(selection, { width: 1024, height: 576 },
    { x: -1280, y: -720, width: 1280, height: 720 }, { x: -1280, y: -720, width: 1280, height: 720 }, { width: 1920, height: 1080 }),
    { x: 188, y: 150, width: 450, height: 225 })
  assert.deepEqual(captureCrop(selection, { width: 1920, height: 1080 },
    { x: 0, y: 0, width: 1920, height: 1080 }, { x: 0, y: 0, width: 1920, height: 1080 }, { width: 1920, height: 1080 }), selection)
})
test('capture clamps edge selections and rejects unusable geometry instead of creating a blank image', () => {
  const bounds = { x: 0, y: 0, width: 100, height: 100 }
  assert.deepEqual(captureCrop({ x: 90, y: 90, width: 30, height: 40 }, bounds, bounds, bounds, bounds), { x: 90, y: 90, width: 10, height: 10 })
  assert.throws(() => captureCrop(selection, { width: 0, height: 1 }, bounds, bounds, bounds))
  assert.throws(() => captureCrop({ ...selection, x: 110 }, bounds, bounds, bounds, bounds))
})
test('every dispatched activity immediately becomes current, even while viewing history', () => {
  const focus = createPresenterActivityFocus()
  focus.reconcile(focus.snapshot(), 'old', ['old'])
  const types = ['multiple_choice', 'short_answer', 'true_false', 'poll', 'pronunciation', 'oral_response', 'drawing', 'hotspot', 'board', 'custom_quiz', 'file_upload', 'reading', 'audio', 'sentence_wall', 'photo_task', 'picture_writing', 'flashcard', 'writing', 'matching', 'ordering', 'listening_quiz']
  for (const type of types) {
    focus.select('history', 'old')
    const oldRead = focus.snapshot()
    assert.deepEqual(focus.dispatch(type), { view: 'current', questionId: type, activeId: type, revision: oldRead.revision + 1 })
    assert.equal(focus.accepts(oldRead), false)
    assert.equal(focus.reconcile(oldRead, 'old', ['old']), null)
    const fresh = focus.reconcile(focus.snapshot(), type, ['old', type])
    assert.equal(fresh.view, 'current')
    assert.equal(fresh.questionId, type)
  }
})
test('manual history navigation survives refreshes, while reactivation or a remote new activity returns to current', () => {
  const focus = createPresenterActivityFocus()
  focus.dispatch('new')
  focus.select('history', 'old')
  assert.equal(focus.reconcile(focus.snapshot(), 'new', ['old', 'new']).questionId, 'old')
  const read = focus.snapshot()
  focus.select('current', 'new')
  assert.equal(focus.reconcile(read, 'new', ['old', 'new']), null)
  focus.select('history', 'old')
  assert.equal(focus.reconcile(focus.snapshot(), 'remote', ['old', 'new', 'remote']).questionId, 'remote')
  focus.dispatch('old')
  assert.equal(focus.snapshot().view, 'current')
  assert.equal(focus.snapshot().questionId, 'old')
})
test('a slow pre-dispatch read cannot overwrite the dispatched activity; event bursts coalesce', async () => {
  const focus = createPresenterActivityFocus(), reload = createSerializedReload(), published = []
  let finish
  const first = reload(async () => {
    const snapshot = focus.snapshot()
    await new Promise(resolve => { finish = resolve })
    const result = focus.reconcile(snapshot, 'old', ['old'])
    if (result) published.push(result.questionId)
  })
  await Promise.resolve()
  focus.dispatch('flashcards')
  for (let i = 0; i < 15; i++) reload(async () => {
    const result = focus.reconcile(focus.snapshot(), 'flashcards', ['old', 'flashcards'])
    if (result) published.push(result.questionId)
  })
  finish()
  await first
  assert.deepEqual(published, ['flashcards'])
})

test('a failed old read still runs the queued dispatch refresh before reporting the error', async () => {
  const reload = createSerializedReload(), published = []
  let finish
  const first = reload(async () => { await new Promise(resolve => { finish = resolve }); throw new Error('offline') })
  await Promise.resolve()
  reload(async () => { published.push('new question') })
  finish()
  await assert.rejects(first, /offline/)
  assert.deepEqual(published, ['new question'])
})
