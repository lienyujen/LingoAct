// Labels added for the English teaching scales. Older shared UI labels remain
// in the reviewed multilingual catalogue.
export const englishTeachingLabels: Record<string, string> = {
  '下一步教學': 'Follow-up',
  '挑作品討論': 'Discuss work',
  '看看全班卡在哪': 'Learning needs',
  '兩人共同任務': 'Pair task',
  '更新各組結果': 'Refresh results',
  '電寫題': 'Handwriting', '电写题': 'Handwriting', '手写题': 'Handwriting',
  '調整語言與程度': 'Language & level',
  '例如：華語初級班・週二': 'e.g. Beginner Chinese · Tuesday',
  '各級學校': 'School levels',
  '普通高中': 'Senior high',
  '國中': 'Junior high', '年級': 'Grade', '難度': 'Difficulty', '一般': 'Standard',
  '七年級':'Grade 7', '八年級':'Grade 8', '九年級':'Grade 9',
  '高一':'Grade 10', '高二':'Grade 11', '高三':'Grade 12',
  '高中一年級':'Grade 10', '高中二年級':'Grade 11', '高中三年級':'Grade 12',
  '技術型高中': 'Vocational high',
  '各級學校・CEFR・全民英檢・多益': 'School levels · CEFR · GEPT · TOEIC',
  '基礎': 'Foundation', '標準': 'Standard', '進階': 'Advanced',
  '口說 50／寫作 30': 'Speaking 50 / Writing 30',
  '口說 90／寫作 70': 'Speaking 90 / Writing 70',
  '口說 120／寫作 120': 'Speaking 120 / Writing 120',
  '口說 160／寫作 150': 'Speaking 160 / Writing 150',
  '口說 180／寫作 180': 'Speaking 180 / Writing 180',
}
for (const [label, english] of [
  ['國中七年級','Grade 7'], ['國中八年級','Grade 8'], ['國中九年級','Grade 9'],
  ['普通高中一年級','Grade 10'], ['普通高中二年級','Grade 11'], ['普通高中三年級','Grade 12'],
] as const) {
  englishTeachingLabels[label] = english
  englishTeachingLabels[`${label}・基礎`] = `${english} · Foundation`
  englishTeachingLabels[`${label}・進階`] = `${english} · Advanced`
}
