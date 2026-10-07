import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'vite'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

test('legacy translations never replace classroom questions, options, matching columns or active flashcards', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
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
