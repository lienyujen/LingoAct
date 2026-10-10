// Explanatory translations and quoted student evidence are outside this guard.
// Check only newly authored teaching material before it reaches the classroom.
const otherScript = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}]/u
export function englishMaterialIssue(...texts: unknown[]) {
  return texts.some(text => typeof text === 'string' && otherScript.test(text))
    ? 'English teaching material must stay in English. Rewrite the title, passage, prompts, options, matching columns and answers in English; keep translated explanations separate.' : ''
}
export function requireEnglishMaterial(...texts: unknown[]) {
  const issue = englishMaterialIssue(...texts)
  if (issue) throw new Error(issue)
}
export const ENGLISH_ACTIVITY_TITLES: Record<string, string> = {
  send_screen: 'Screenshot', poll: 'Poll', multiple_choice: 'Multiple choice', true_false: 'True or false',
  short_answer: 'Short answer', pronunciation: 'Read aloud', oral_response: 'Speaking',
  file_upload: 'Upload', drawing: 'Handwriting', hotspot: 'Image markers', board: 'Discussion',
}
