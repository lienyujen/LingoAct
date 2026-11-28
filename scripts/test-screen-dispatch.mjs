import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { screenDispatchQuestion, supportingScreenQuestion } from '../src/lib/screenDispatch.ts'
import { readingVocabularyContext } from '../supabase/functions/_shared/chinese-word-matching.ts'
import { MAX_RECORDING_SECONDS } from '../supabase/functions/_shared/recording-limits.ts'
import { adaptStudentPrompt } from '../supabase/functions/_shared/student-prompt.ts'
import { asksForTranslation, splitWrittenAssessmentPrompt } from '../supabase/functions/_shared/written-assessment.ts'

const source = readFileSync('supabase/functions/presenter-action/index.ts', 'utf8')
const participant = readFileSync('src/routes/ParticipantPage.tsx', 'utf8')
const js = text => ts.transpile(text, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None })
const q = (id, type, time, extra = {}) => ({ id, type, session_id: 'class', status: 'active', created_at: time, ...extra })
const old = q('task', 'short_answer', '2026-11-12T01:00:00Z')
const screen = q('screen', 'send_screen', '2026-11-12T01:01:00Z', { screenshot_id: 'image' })

function database(rows) {
  return { from(table) {
    let filters = [], update, insert, sort, one = false, limit = Infinity
    const query = {
      select() { return query },
      eq(key, value) { filters.push(row => row[key] === value); return query },
      neq(key, value) { filters.push(row => row[key] !== value); return query },
      not(key, op, value) { assert.equal(op, 'in'); const values = value.slice(1, -1).split(','); filters.push(row => !values.includes(row[key])); return query },
      order(key, options) { sort = (a, b) => String(a[key]).localeCompare(String(b[key])) * (options?.ascending === false ? -1 : 1); return query },
      limit(value) { limit = value; return query },
      single() { one = true; return query }, maybeSingle() { one = true; return query },
      update(value) { update = value; return query }, insert(value) { insert = value; return query },
      then(resolve, reject) { return Promise.resolve().then(() => {
        rows[table] ||= []
        let selected = rows[table].filter(row => filters.every(match => match(row)))
        if (insert) { const value = { id: 'created', created_at: '2026-11-12T02:00:00Z', ...insert }; rows[table].push(value); selected = [value] }
        if (update) selected.forEach(row => Object.assign(row, update))
        if (sort) selected = selected.slice().sort(sort)
        selected = selected.slice(0, limit)
        return { data: one ? selected[0] || null : selected, error: null }
      }).then(resolve, reject) },
    }
    return query
  }, storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: 'https://example.test/image.png' } }) }) } }
}

test('screens supplement every response type, choose the latest active one and never revive stopped tasks', () => {
  for (const type of ['short_answer', 'multiple_choice', 'true_false', 'poll', 'custom_quiz', 'drawing', 'file_upload', 'hotspot', 'pronunciation', 'oral_response', 'listening']) {
    const task = { ...old, type }
    assert.equal(screenDispatchQuestion(screen, [task, screen]), task)
    assert.equal(screenDispatchQuestion(task, [task, screen]), task)
    assert.equal(supportingScreenQuestion(task, [task, screen]), screen)
  }
  assert.equal(screenDispatchQuestion(screen, [{ ...old, status: 'stopped' }, screen]), screen)
  assert.equal(screenDispatchQuestion(screen, [{ ...old, type: 'board' }, screen]), screen)
  assert.equal(supportingScreenQuestion(q('new', 'short_answer', '2026-11-12T01:02:00Z'), [screen]), null)
  assert.equal(supportingScreenQuestion(old, [{ ...screen, share_screenshot: false }]), null)
  assert.equal(supportingScreenQuestion(old, [{ ...screen, status: 'draft' }]), null)
  const later = { ...screen, id: 'later', created_at: '2026-11-12T01:01:30Z' }
  assert.equal(supportingScreenQuestion(old, [later, screen]), later)
})

test('the real create_question handler keeps current tasks and boards alive for images, and still replaces tasks for new questions', async () => {
  const action = source.slice(source.indexOf("    if (action === 'create_question')"), source.indexOf("    if (action === 'stop_question')"))
  const stop = source.slice(source.indexOf('function stopActiveQuestions('), source.indexOf('// Tells one learner'))
  for (const type of ['send_screen', 'short_answer', 'board']) {
    const rows = { questions: [{ ...old }, { ...old, id: 'board', type: 'board' }], sessions: [{ id: 'class', status: 'active', current_question_id: 'task', board_question_id: 'board' }] }
    const context = vm.createContext({
      input: { questionType: type, screenshotId: 'shot', storagePath: 'sessions/class/screenshots/shot.png', boardFormats: ['text'] },
      action: 'create_question', sessionId: 'class', supabase: database(rows),
      adaptStudentPrompt, asksForTranslation, splitWrittenAssessmentPrompt, sessionContext: async () => rows.sessions[0], questionTypes: new Set(['send_screen', 'short_answer', 'board']),
      validUuid: () => true, normalizedOptions: () => [], timedTypes: new Set(), spokenTypes: new Set(), boardKinds: new Set(['text']),
      timingSeconds: () => null, MAX_RECORDING_SECONDS, storedObject: async () => ({ ok: true }), sessionTrack: async () => 'mandarin',
      activityTitle: (_, __, title) => title, jsonResponse: (data, status = 200) => ({ data, status }),
    })
    const result = await vm.runInContext(js(`${stop}\n(async()=>{${action}})()`), context)
    assert.equal(result.status, 200)
    assert.equal(rows.questions.find(row => row.id === 'task').status, type === 'send_screen' ? 'active' : 'stopped')
    assert.equal(rows.sessions[0].current_question_id, type === 'send_screen' ? 'task' : 'created')
    assert.equal(rows.questions.find(row => row.id === 'board').status, type === 'board' ? 'stopped' : 'active')
    assert.equal(rows.screenshots.length, 1)
  }
})

test('the student loader retains quiz, answer, reading passage and source image beside the supporting screenshot', async () => {
  const body = participant.slice(participant.indexOf('    let activeQuestion:'), participant.indexOf('    const historySignature'))
  for (const legacyPointer of [false, true]) {
    const task = { ...old, type: 'custom_quiz', screenshot_id: 'source-image', share_screenshot: true }
    const state = {}, calls = []
    const rows = { questions: [task, screen], screenshots: [{ id: 'image', public_url: 'supplement' }, { id: 'source-image', public_url: 'original' }], reading_passages: [{ question_id: task.id, text: 'Reading text' }] }
    const context = {
      nextSession: { current_question_id: legacyPointer ? screen.id : task.id, level_framework: 'tbcl', level_code: '2' }, allQuestions: rows.questions,
      readingVocabularyContext,
      allAnswers: [{ question_id: task.id, answer_text: 'my answer' }], screenDispatchQuestion, supportingScreenQuestion,
      supabase: { ...database(rows), functions: { invoke: async (_, { body }) => { calls.push(body); return { data: { quiz: 'ready' } } } } },
      read: (_, load) => load(), requestId: 1, loadSequence: { current: 1 }, participantToken: 'token', sessionId: 'class', participantId: 'student', locale: 'vi',
      loadedQuizQuestionId: { current: 'task' }, participantQuizPayload: (_, id) => ({ questionId: id }),
    }
    for (const name of new Set(body.match(/\bset[A-Z]\w*(?=\()/g))) context[name] = value => { state[name] = value }
    await vm.runInNewContext(js(`(async()=>{${body}})()`), context)
    assert.equal(state.setQuestion.id, task.id)
    assert.equal(state.setAnswer.answer_text, 'my answer')
    assert.equal(state.setSupportingScreen.public_url, 'supplement')
    assert.equal(state.setScreenshot.public_url, 'original')
    assert.equal(state.setPassage.text, 'Reading text')
    assert.equal(state.setPassage.level_framework, 'tbcl')
    assert.equal(state.setPassage.level_code, '2')
    assert.equal(state.setPassageImageUrl, 'original')
    assert.equal(state.setQuizData.questionId, task.id)
    assert.equal(calls[0].questionId, task.id)
  }
})

test('teacher dispatch keeps stop and grading controls on the response activity while retaining both rows', () => {
  const presenter = readFileSync('src/routes/PresenterPage.tsx', 'utf8')
  const body = presenter.slice(presenter.indexOf('  function showDispatchedQuestion('), presenter.indexOf('  function navigateWorkspace('))
  for (const task of [old, { ...old, type: 'custom_quiz' }]) {
    const state = { questions: [task], session: { current_question_id: task.id } }
    let focus
    const context = { questions: state.questions, screenDispatchQuestion, activityFocus: { dispatch: id => { focus = id } }, loadAll() {} }
    for (const name of new Set(body.match(/\bset[A-Z]\w*(?=\()/g))) {
      const key = name.slice(3, 4).toLowerCase() + name.slice(4)
      context[name] = value => { state[key] = typeof value === 'function' ? value(state[key]) : value }
    }
    vm.runInNewContext(js(`${body}\nshowDispatchedQuestion(${JSON.stringify(screen)})`), context)
    assert.equal(focus, task.id)
    assert.equal(state.session.current_question_id, task.id)
    assert.equal(state.question.id, task.id)
    assert.equal(state.questions.find(row => row.id === task.id).status, 'active')
    assert.equal(state.questions.find(row => row.id === screen.id).type, 'send_screen')
    assert.equal(state.workspaceView, 'current')
  }
})
