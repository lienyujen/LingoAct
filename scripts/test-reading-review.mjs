import { fixtureSql } from './live-test-db.mjs'
// A live fixture for the teacher's enlarged reading-quiz view. It uses no AI
// and removes the exact session in finally, so verifying the response does not
// leave a class, a clip or a passage behind.
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'

const project = process.env.LINGOACT_TEST_PROJECT
if (!project) throw new Error('Set LINGOACT_TEST_PROJECT; sign in to the Supabase CLI or set SUPABASE_ACCESS_TOKEN.')

const sessionId = randomUUID()
const questionId = randomUUID()
const quizId = randomUUID()
const itemId = randomUUID()
const clipId = randomUUID()
const presenterToken = randomUUID() + randomUUID()
const participantId = randomUUID(), participantToken = randomUUID() + randomUUID()
const failedTitles = ['出題失敗，請重新派送', '出题失败，请重新发送', 'Question generation failed. Please try again.', 'Question generation failed. Please send it again.']
const failedQuestions = failedTitles.map(title => ({ id: randomUUID(), title }))
const hash = (value) => createHash('sha256').update(value).digest('hex')

const sql = query => fixtureSql(project, query)

try {
  await sql(`
    insert into sessions(id,title,code,anonymous_enabled) values('${sessionId}','Reading review integration fixture','${sessionId}',true);
    insert into presenter_session_keys(session_id,token_hash) values('${sessionId}','${hash(presenterToken)}');
    insert into participants(id,session_id,name,device_id) values('${participantId}','${sessionId}','QA learner','${participantId}');
    insert into participant_session_keys(participant_id,token_hash) values('${participantId}','${hash(participantToken)}');
    ${failedQuestions.map(question => `insert into questions(id,session_id,type,status,title) values('${question.id}','${sessionId}','custom_quiz','active','${question.title}');`).join('\n')}
    insert into questions(id,session_id,type,status,title,prompt_text,karaoke_cues)
      values('${questionId}','${sessionId}','custom_quiz','active','A day at school','Read and answer.',
        '[{"start_index":0,"end_index":5,"start_ms":0,"end_ms":900}]'::jsonb);
    insert into quizzes(id,session_id,question_id,title,direction,requested_type,graded)
      values('${quizId}','${sessionId}','${questionId}','A day at school','Read and answer.','multiple_choice',true);
    insert into quiz_items(id,quiz_id,position,type,prompt_text,options,points)
      values('${itemId}','${quizId}',1,'multiple_choice','Where is Xiaoming?','["School","Home"]'::jsonb,100);
    insert into quiz_item_keys(item_id,accepted_answers,rubric)
      values('${itemId}',array['School'],'School is stated in the passage.');
    insert into listening_clips(id,session_id,source,kind,language,script,transcript,storage_path,public_url,duration_ms,content_hash)
      values('${clipId}','${sessionId}','text','passage','zh-tw','traditional','小明今天去學校。',
        'fixtures/${clipId}.mp3','https://example.com/fixture.mp3',900,'${clipId}');
    update questions set listening_clip_id='${clipId}' where id='${questionId}';
    insert into reading_passages(session_id,question_id,title,body,source,vocabulary,grammar,listening_clip_id,words,annotation,annotation_text)
      values('${sessionId}','${questionId}','上學的一天','小明今天去學校。','pasted',
        '[{"word":"學校","level":1,"pos":"名詞","gloss":{"zh_tw":"上課的地方","en":"school"}}]'::jsonb,
        '[{"point":"去 + 地方","level":1,"example":"我去學校。","span":"去學校","note":{"zh_tw":"表示前往某地","en":"go to a place"}}]'::jsonb,
        '${clipId}','[]'::jsonb,'pinyin','["xiǎo","míng","jīn","tiān","qù","xué","xiào",""]');
  `)

  const response = await fetch(`https://${project}.supabase.co/functions/v1/presenter-action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'get_custom_quiz_results', sessionId, questionId, presenterToken }),
  })
  const result = await response.json()
  assert.equal(response.status, 200, JSON.stringify(result))
  assert.equal(result.readingPassage?.body, '小明今天去學校。')
  assert.equal(result.readingPassage?.vocabulary?.[0]?.word, '學校')
  assert.equal(result.readingClip?.id, clipId)
  assert.equal(result.readingCues?.length, 1)
  assert.equal(result.readingImageUrl, null)
  assert.equal(result.anonymousEnabled, true)
  for (const question of failedQuestions) for (const endpoint of ['presenter-action', 'participant-action']) {
    const failed = await fetch(`https://${project}.supabase.co/functions/v1/${endpoint}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, questionId: question.id, presenterToken, participantId, participantToken, action: endpoint === 'presenter-action' ? 'get_custom_quiz_results' : 'get_custom_quiz' }),
    })
    assert.equal(failed.status, 503, `${endpoint}: failed generation must not return a preparing sentinel`)
  }
  console.log('All localized failed-generation states stop teacher/student polling.')
  console.log('Reading review live fixture passed.')
} finally {
  await sql(`delete from sessions where id='${sessionId}'`)
}
