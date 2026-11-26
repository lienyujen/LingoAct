import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'vite'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

test('legacy translations never replace classroom questions, options, matching columns or active flashcards', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } })
  try {
    const { ParticipantQuestionView } = await server.ssrLoadModule('/src/components/ParticipantQuestionView.tsx')
    const { ParticipantCustomQuiz } = await server.ssrLoadModule('/src/components/ParticipantCustomQuiz.tsx')
    const { ParticipantFlashcards } = await server.ssrLoadModule('/src/components/ParticipantFlashcards.tsx')
    const locales = ['en','vi','th','ja','ko','id','zh-CN','zh-TW']
    const translations = Object.fromEntries([...locales,'zh_tw'].map(locale => [locale, {
      title:'UNWANTED_TRANSLATED_TITLE',prompt_text:'UNWANTED_TRANSLATED_PROMPT',
      options:['UNWANTED_TRANSLATED_OPTION_A','UNWANTED_TRANSLATED_OPTION_B'],
      pair_prompts:['UNWANTED_TRANSLATED_PAIR_A','UNWANTED_TRANSLATED_PAIR_B'],
    }]))
    const item = { id:'item',type:'multiple_choice',prompt_text:'今天是星期幾？',options:['星期三','星期四'],pair_prompts:[],points:100,translations,prompt_is_word:true }
    const question = { ...item,id:'question',title:'課堂題目',status:'active',allow_multiple:false }
    const quiz = { id:'quiz',question_id:question.id,title:'教師原文',requested_type:'multiple_choice',graded:true }
    const base = { quiz,items:[item],answers:[],attempt:null,reviewAnswers:{} }
    const render = (Component, props) => renderToStaticMarkup(React.createElement(Component,props))
    for (const locale of locales) {
      const common = { locale,busy:false,onSubmit:()=>{},onRetry:async()=>{},onAskCoach:async()=>{} }
      for (const answer of [null,{answer_value:'星期三'}]) {
        const html=render(ParticipantQuestionView,{question,answer,locale,audioBusy:false,audioResponse:null,onSubmit:()=>{},onSubmitAudio:async()=>{},onDiscardAudio:async()=>{}})
        assert.ok(html.includes(item.prompt_text));assert.ok(html.includes('星期三'));assert.ok(!html.includes('UNWANTED_TRANSLATED'))
      }
      for(const type of ['multiple_choice','matching','ordering']) {
        const data={...base,items:[{...item,type,pair_prompts:type==='matching'?['今天','明天']:[]}]}
        const html=render(ParticipantCustomQuiz,{...common,data})
        assert.ok(html.includes(item.prompt_text));assert.ok(html.includes('星期三'));assert.ok(!html.includes('UNWANTED_TRANSLATED'))
        if(type==='matching')assert.ok(html.includes('今天'))
      }
      const html=render(ParticipantFlashcards,{active:true,locale,data:{...base,quiz:{...quiz,requested_type:'flashcard'}},onTry:async()=>({correct:false,correctAnswer:null})})
      assert.ok(html.includes(item.prompt_text));assert.ok(html.includes('星期三'));assert.ok(!html.includes('UNWANTED_TRANSLATED'))
    }
  } finally { await server.close() }
})

test('flashcard pictures are bundled, optional and only shown beside a visible word', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } })
  try {
    const { ParticipantFlashcards } = await server.ssrLoadModule('/src/components/ParticipantFlashcards.tsx')
    const { flashcardPicture } = await server.ssrLoadModule('/src/lib/flashcardPictures.ts')
    const quiz = { id: 'deck', requested_type: 'flashcard' }
    const item = { id: 'card', prompt_text: '雨傘', prompt_is_word: true, options: ['Umbrella', 'Backpack'] }
    const renderCard = ({ active = true, card = item, reviewAnswers = {} } = {}) => renderToStaticMarkup(React.createElement(ParticipantFlashcards, {
      active, data: { quiz, items: [card], answers: [], reviewAnswers }, locale: 'zh-TW',
    }))

    const link = new URL(flashcardPicture('雨傘').searchUrl)
    assert.equal(link.origin, 'https://www.google.com')
    assert.equal(link.searchParams.get('q'), '雨傘')
    assert.equal(link.searchParams.get('tbm'), 'isch')
    assert.equal(link.searchParams.get('safe'), 'active')
    for (const word of ['雨傘', '雨伞', '傘', 'Umbrella']) {
      assert.match(flashcardPicture(word).src, /flashcard-images\/umbrella\.png$/)
    }
    const activeWordCard = renderCard()
    assert.match(activeWordCard, /class="flashcard-image-link"/)
    assert.match(activeWordCard, /target="_blank"/)
    assert.match(activeWordCard, /rel="noopener noreferrer"/)
    assert.ok(activeWordCard.indexOf('class="flashcard-image-link"') < activeWordCard.indexOf('class="flashcard-prompt is-word'))

    const definitionFirst = { ...item, prompt_text: 'Something that keeps rain off you', prompt_is_word: false, options: ['雨傘', '背包'] }
    assert.doesNotMatch(renderCard({ card: definitionFirst, reviewAnswers: { card: '雨傘' } }), /flashcard-image-link/)
    assert.match(renderCard({ active: false, card: definitionFirst, reviewAnswers: { card: '雨傘' } }), /flashcard-images\/umbrella\.png/)
    for (const word of ['拿起雨傘', '聽說', 'https://example.com/image.png']) {
      assert.equal(flashcardPicture(word), null)
      assert.doesNotMatch(renderCard({ card: { ...item, prompt_text: word } }), /flashcard-image-link/)
    }
  } finally {
    await server.close()
  }
})

test('previously saved reading marks take their levels from the selected Chinese vocabulary table', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } })
  try {
    const { ReadingPassageView } = await server.ssrLoadModule('/src/components/ReadingPassageView.tsx')
    const renderPassage = (framework, words) => renderToStaticMarkup(React.createElement(ReadingPassageView, {
      locale: 'zh-TW',
      passage: {
        title: '字詞測試', body: words.join('。'), level_framework: framework, level_code: '2', grammar: [],
        vocabulary: words.map((word) => ({ word, level: 0, pos: '', gloss: {} })),
      },
    }))
    const tbcl = renderPassage('tbcl', ['看', '和', '好', '第二', '了', '一下', '卡片'])
    assert.equal((tbcl.match(/reading-mark is-word level-0/g) || []).length, 1)
    assert.equal((tbcl.match(/reading-mark is-word level-2/g) || []).length, 1)
    const hsk = renderPassage('hsk', ['好看', '第四', '图片', '卡片'])
    assert.doesNotMatch(hsk, /reading-mark is-word level-0/)
    assert.match(hsk, /reading-mark is-word level-4/)
    assert.match(hsk, /reading-mark is-word level-6/)
  } finally {
    await server.close()
  }
})
