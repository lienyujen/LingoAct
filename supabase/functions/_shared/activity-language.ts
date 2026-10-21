import { ENGLISH_ACTIVITY_TITLES } from './english-material.ts'

const simplified: Record<string,string> = {
  send_screen:'发送画面',poll:'投票',multiple_choice:'选择题',true_false:'判断题',short_answer:'简答题',
  pronunciation:'朗读练习',oral_response:'口语表达',file_upload:'文件上传',drawing:'手写题',hotspot:'图片标记',board:'讨论区',
  followup:'延伸练习',discussion:'作品讨论',pair:'两人任务',matching:'配对题',ordering:'排序题',
  photo:'照片描述',sentence:'造句',picture_story:'图片排序写作',listening:'听力练习',reading:'阅读',
}
const english = {...ENGLISH_ACTIVITY_TITLES,followup:'Follow-up',discussion:'Discuss work',pair:'Pair task',matching:'Matching',ordering:'Ordering',photo:'Photo task',sentence:'Sentence practice',picture_story:'Picture story',listening:'Listening',reading:'Reading'}
const japanese: Record<string, string> = {
  send_screen: '画面を共有', poll: '投票', multiple_choice: '選択問題', true_false: '○×問題', short_answer: '記述問題',
  pronunciation: '音読', oral_response: '話して回答', file_upload: 'ファイル提出', drawing: '手書き回答', hotspot: '画像にマーク', board: '意見共有ボード',
  followup: 'もう一度練習', discussion: '作品について話し合う', pair: 'ペアの課題', matching: '組み合わせ', ordering: '並べ替え',
  photo: '写真を撮って説明', sentence: '文づくり', picture_story: '絵を並べて物語を書く', listening: 'リスニング', reading: '読解',
}
export function activityTitle(track: string | null | undefined, type: string, traditional: string) {
  return track === 'ja' ? japanese[type] || '学習活動' : track === 'en' ? english[type] || 'Activity' : track === 'putonghua' ? simplified[type] || traditional : traditional
}
