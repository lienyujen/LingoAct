// Both endpoints store a student-visible notice, never a provider's raw error.
export function readingQuizFailureMessage(track: string | null | undefined, framework: string | null | undefined, detail: string) {
  const timeout = /timed?\s*out|timeout|abort/i.test(detail)
  const limited = /429|quota|rate.?limit|resource.?exhausted/i.test(detail)
  if (track === 'ja') return timeout ? '問題の生成がタイムアウトしました。本文は保存されています。先生に再配信をお願いしてください。' : '問題を生成できませんでした。本文を読むか、先生に再配信をお願いしてください。'
  if (track === 'en') return timeout ? 'Question generation timed out. Your passage is saved. Ask your teacher to try again.' : 'The questions could not be generated. Read the passage, or ask your teacher to send the activity again.'
  if (track === 'putonghua' || framework === 'hsk') return timeout ? '测验题生成超时，文章已保留。你可以先阅读文章，或请老师重新发送。' : limited ? 'AI 服务暂时达到调用限额，测验题生成失败。文章已保留，请老师稍后重试。' : '这篇文章的测验题生成失败。你可以先阅读文章，或请老师重新发送。'
  return timeout ? '測驗題生成逾時，文章已保留。可以先閱讀文章，或請老師重新派送。' : limited ? 'AI 服務暫時達到呼叫額度，測驗題生成失敗。文章已保留，請老師稍後重試。' : '這篇的題目沒有生成成功，可以直接讀，或請老師重新派送。'
}
