export function pictureStudentPrompt(prompt: string, hints: { targetWords: string[]; pattern: string }, labels: { words: string; pattern: string }) {
  return [prompt.trim(), hints.targetWords.length ? `${labels.words}：${hints.targetWords.join('、')}` : '',
    hints.pattern.trim() ? `${labels.pattern}：${hints.pattern.trim()}` : ''].filter(Boolean).join('\n\n')
}
