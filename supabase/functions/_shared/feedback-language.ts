import { resolveLevel } from './proficiency.ts'

export type FeedbackSettings = {
  system_language?: string | null
  teaching_language?: string | null
  guidance_language?: string | null
  level_framework?: string | null
  level_code?: string | null
}

export async function classFeedbackSettings(
  db: { from: (table: string) => { select: (columns: string) => { eq: (column: string, value: string) => { maybeSingle: () => Promise<{ data: FeedbackSettings | null; error?: unknown }> } } } },
  sessionId: string,
): Promise<FeedbackSettings> {
  const { data, error } = await db.from('sessions')
    .select('system_language, teaching_language, guidance_language, level_framework, level_code')
    .eq('id', sessionId).maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Class not found.')
  return data
}

export function usesMainlandFeedback(settings?: FeedbackSettings) {
  if (settings?.system_language === 'zh-TW') return false
  return settings?.system_language === 'zh-CN'
    || settings?.teaching_language === 'putonghua'
    || settings?.level_framework === 'hsk'
}

// Legacy JSON keys such as summary_zh_tw are also read by installed clients.
// They keep their shape; the class, rather than the key's name, sets the script.
export function mainlandFeedbackInstruction(settings?: FeedbackSettings) {
  if (!usesMainlandFeedback(settings)) return ''
  const resolved = resolveLevel(settings?.level_framework ?? null, settings?.level_code ?? null)
  return [
    'All Chinese analysis, assessments, feedback, revision explanations and teaching recommendations must be written in natural, standard Mainland Chinese using Simplified characters. This includes legacy JSON keys containing zh_tw or zhTw and all Chinese base fields outside translations.en. These names are compatibility keys, not output-language instructions.',
    'Use Mainland vocabulary and standard Putonghua, Hanyu Pinyin and official HSK vocabulary/grammar norms when explaining Chinese. Do not use Taiwan regional terms, Taiwanese pronunciation or Bopomofo. For example, use 学生、提交、反馈、图片、文件、朗读、词语; write directly and concretely, avoiding stiff translations and administrative jargon.',
    resolved
      ? `FEEDBACK LEVEL. The class is working at ${resolved.level.label}, on the ${resolved.framework.name} scale. What a learner at this level can read: ${resolved.level.ceiling}`
      : 'No class level was set: keep feedback plain and concise for an intermediate learner.',
    'The teacher-selected class level above is the baseline for the wording of feedback, even when the task itself stretches above it. Use short, clear sentences and mostly vocabulary and grammar the learner knows at this level. A little harder is acceptable when needed: briefly explain an unfamiliar essential word. Do not automatically raise the whole explanation by one or two levels. Give one or two specific, achievable next steps. Judge performance against the task and class level; do not deduct points just because a beginner uses simple language.',
    'Individual assessment is addressed directly to the learner using 你, not 学生 or 这位学生. Say what they did well and what to do next in everyday language; avoid abstract statements such as 语言表达规范、符合初级要求、内容完整度 or administrative descriptions of the learner. Whole-class reports may describe the class, but use similarly plain wording.',
    settings?.level_framework === 'hsk' && ['1', '2'].includes(settings?.level_code || '')
      ? 'For this beginner HSK class, individual summary should be two or three short sentences, preferably no more than 22 Chinese characters per sentence. Use at most two strengths and two improvements, one short sentence each. For example, prefer 你写了自己的名字。句子很清楚。下次可以写你是哪国人。 to a long judgment full of abstract terms. These are examples of wording only: base the actual feedback on this submission. Do not simplify by omitting the reason for a correction or inventing a mistake.'
      : '',
    'An English translation, where requested, must faithfully preserve the same evidence, judgment and meaning. Quoted learner answers, supplied source text, names and transcripts are evidence: keep them faithful, and never silently rewrite that evidence merely to change its script. Use Simplified Chinese for your own surrounding explanations.',
  ].filter(Boolean).join('\n')
}

export function feedbackSystemPrompt(original: string, settings?: FeedbackSettings) {
  if (settings?.teaching_language === 'en') {
    const englishGuidance = settings.guidance_language === 'en'
    const prompt = englishGuidance ? original.replaceAll('繁體中文', 'English').replaceAll('Traditional Chinese', 'English') : original
    return [prompt,
      'This is an English language class. Assess English against the selected class level and the actual task. Keep quoted learner answers, corrections, target vocabulary, sentence patterns and transcripts in their original English. Do not apply Mandarin pronunciation, Pinyin, Bopomofo, TBCL or HSK rules. Accept intelligible American and British English and other established English varieties; do not invent an error merely because a spelling or accent differs from the model.',
      englishGuidance ? 'Write explanatory feedback in plain English, including legacy base fields named zh_tw: these are compatibility keys. Keep translations.en faithful to the same evidence and judgment.' : 'Write the surrounding explanation in Traditional Chinese, with its faithful English counterpart where requested.',
      'Keep explanations accessible at the teacher-selected class level; a little stretch is acceptable. Give concrete evidence and one or two achievable next steps. Classroom AI marks are not official exam scores.',
    ].join('\n\n')
  }
  if (!usesMainlandFeedback(settings)) return original
  // Remove the old explicit script demand before adding the class policy, so
  // the model is never asked to obey two contradictory output languages.
  const prompt = original.replaceAll('繁體中文', '中国大陆规范简体中文')
    .replaceAll('Traditional Chinese', 'Mainland standard Simplified Chinese')
  return [prompt, mainlandFeedbackInstruction(settings)].join('\n\n')
}
