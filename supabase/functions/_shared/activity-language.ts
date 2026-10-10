import { ENGLISH_ACTIVITY_TITLES } from './english-material.ts'

const simplified: Record<string,string> = {
  send_screen:'发送画面',poll:'投票',multiple_choice:'选择题',true_false:'判断题',short_answer:'简答题',
  pronunciation:'朗读练习',oral_response:'口语表达',file_upload:'文件上传',drawing:'手写题',hotspot:'图片标记',board:'讨论区',
  followup:'延伸练习',discussion:'作品讨论',pair:'两人任务',matching:'配对题',ordering:'排序题',
  photo:'照片描述',sentence:'造句',picture_story:'图片排序写作',listening:'听力练习',reading:'阅读',
}
const english = {...ENGLISH_ACTIVITY_TITLES,followup:'Follow-up',discussion:'Discuss work',pair:'Pair task',matching:'Matching',ordering:'Ordering',photo:'Photo task',sentence:'Sentence practice',picture_story:'Picture story',listening:'Listening',reading:'Reading'}
export function activityTitle(track: string | null | undefined, type: string, traditional: string) {
  return track === 'en' ? english[type] || 'Activity' : track === 'putonghua' ? simplified[type] || traditional : traditional
}
