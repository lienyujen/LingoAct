export function asksForTranslation(prompt: string) {
  return /翻[譯译](?:題|题|成|為|为|到|以下|下列|這|这|圖|图|原文|全文)|翻[譯译][^。！？\n]{0,80}(?:成|為|为|到)|譯成|译成|翻成|翻為|翻为|翻訳(?:問題|して|しなさい|しよう)|訳して|訳しなさい|\btranslation (?:question|exercise|task)\b|(?:^|[.!?\n])\s*(?:please\s+)?translate\b|\btranslate\b[^.!?\n]{0,160}\b(?:into|to)\b|\btradui[stsz]\b|\btradu(?:ce|zca|cir)\b|번역해|번역하|dịch[^.!?\n]{0,80}(?:sang|qua)/iu.test(prompt)
}

export function splitWrittenAssessmentPrompt(value: string) {
  // A labelled rubric can include a reference answer. Keep it in the teacher
  // key, where the student can only receive their own eventual feedback.
  const label = /(^|[\n。！？!?；;]\s*|\.\s+)(?:評分標準|评分标准|配分|rubric|grading criteria|採点基準|評価基準)\s*[:：]/iu.exec(value)
  if (!label) return { prompt: value.trim(), rubric: '' }
  return {
    prompt: value.slice(0, label.index + label[1].length).trim(),
    rubric: value.slice(label.index + label[0].length).trim(),
  }
}

export function isWrittenAssessment(quiz: { requested_type?: string; interaction_mode?: boolean; graded?: boolean }) {
  // The combination denotes a teacher-authored single written item, as
  // opposed to short answers that an AI authored for a custom quiz.
  return quiz.requested_type === 'short_answer' && quiz.interaction_mode === true && quiz.graded === true
}
