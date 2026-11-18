// The criteria are classroom rubrics aligned to the curriculum's stages.
// Weights can guide feedback even when the teacher does not publish a score.
type Criterion = readonly [name: string, weight: number, description: string]
type Rubric = { label: string; criteria: readonly Criterion[]; guidance: string }

const elementaryLow: Rubric = {
  label: '國小一、二年級',
  criteria: [
    ['切題與意思', 40, '能寫出與題目有關的事件、人物或感受，讀者看得懂要說什麼。'],
    ['句子與順序', 35, '能寫出完整句子；需要多句時，先後順序清楚。'],
    ['用字與標點', 25, '常用字與句末標點逐步寫對；在題目允許時，可用注音補充未學過的字。'],
  ],
  guidance: '依任務要求評估一句或數句。每次優先指出一項最容易自行修正的地方，不要求篇章或抽象論證。',
}
const elementaryMiddle: Rubric = {
  label: '國小三、四年級',
  criteria: [
    ['切題與具體內容', 40, '有清楚重點，能用一個具體動作、經過或例子補充。'],
    ['段落與連接', 35, '句子按時間、因果或主題排列，一段集中表達一件事。'],
    ['用字與標點', 25, '詞語符合情境，句意完整，基本標點能幫助閱讀。'],
  ],
  guidance: '短段寫作可在一段內完成；依題目要求看有沒有細節與順序。',
}
const elementaryHigh: Rubric = {
  label: '國小五、六年級',
  criteria: [
    ['主旨與材料', 35, '主旨明確，能挑選具體事例、描寫或理由說明重點。'],
    ['篇章組織', 30, '段落分工清楚，前後能連接，結尾回應主旨。'],
    ['表達與修訂', 35, '措辭清楚，能用恰當語句與標點表達感受或觀點，修正妨礙理解之處。'],
  ],
  guidance: '依記敘、說明或短篇議論的任務評量；寫作長度以教師要求為準。',
}
const junior: Rubric = {
  label: '國中七至九年級',
  criteria: [
    ['立意與取材', 35, '回應題意，能以事件細節、例證或文本線索支撐主旨。'],
    ['結構與發展', 30, '段落有功能，前後銜接，能解釋例子如何連到主旨。'],
    ['措辭與文體', 25, '語句清楚，文體、語氣與對象相符。'],
    ['文字校訂', 10, '字詞、標點與格式恰當，註明必要的原文依據。'],
  ],
  guidance: '記敘看細節與轉折，說明看層次與因果，議論看主張與理由。例證與引用依題目要求。',
}
const senior: Rubric = {
  label: '高中十至十二年級',
  criteria: [
    ['立意與任務完成', 30, '掌握題意，主張或情感核心明確，能形成有辨識度的觀點。'],
    ['材料與深化', 30, '精選證據、例子或感官細節，解釋其意義；議論可處理合理的反面觀點。'],
    ['結構與推進', 25, '段落依意義推進，分析或敘事前後連貫，收束呼應核心。'],
    ['語言與修訂', 15, '措辭精確、文體一致，必要引文可回溯。'],
  ],
  guidance: '知性寫作看論證與材料，情意寫作看具體經驗、感受與反思。依作業文體取捨，不把這份百分制當成官方國寫級分。',
}
const college: Rubric = {
  label: '大一國文',
  criteria: [
    ['問題與主張', 25, '提出可討論的問題，形成清楚且有範圍的主張。'],
    ['文本與來源', 30, '引文準確且可追溯，能區分原文、摘要與自己的判斷。'],
    ['分析與結構', 30, '解釋證據如何支持主張，推論連貫，能指出證據限制或回應另一種解讀。'],
    ['文體與修訂', 15, '符合指定文體，語句精確，引用格式與修訂重點合宜。'],
  ],
  guidance: '依課程目標調整文學鑑賞、文化論述或應用寫作的重點。教師未提供來源時，不虛構出處或擅判真假。',
}
const advanced: Rubric = {
  ...college,
  label: '大學進階國文',
  guidance: '依任務比較來源與詮釋，評估證據限制與反例；扣分前確認要求確實出現在題目。教師未提供來源時，標為待核對。',
}

export function guoyuWritingRubric(track: string | null, framework: string | null, level: string | null): Rubric | null {
  if (track !== 'guoyu') return null
  if (framework === 'collegeChinese') return level === 'advanced' ? advanced : level === 'freshman' ? college : null
  if (framework !== 'guoyu108' || !level) return null
  if (/^g[12]$/.test(level)) return elementaryLow
  if (/^g[34]$/.test(level)) return elementaryMiddle
  if (/^g[56]$/.test(level)) return elementaryHigh
  if (/^j[1-3]$/.test(level)) return junior
  if (/^h[1-3]$/.test(level)) return senior
  return null
}

export function guoyuWritingInstruction(track: string | null, framework: string | null, level: string | null, coaching = false) {
  const rubric = guoyuWritingRubric(track, framework, level)
  if (!rubric) return ''
  return [
    `臺灣國語文寫作評量：${rubric.label}。先看教師指定的任務與文體，只有適用本題的面向才列入評量。`,
    ...rubric.criteria.map(([name, weight, detail]) => `${name}${coaching ? '' : `（${weight}%）`}：${detail}`),
    rubric.guidance,
    coaching
      ? '只挑一項此刻最值得改善的面向，問能引導學生自行修改的問題。不要給分、代寫或提供可直接貼上的改句。'
      : '用學生原句支持評語，先指出一項做得好的地方，再給一項可執行的修訂方向。按面向加權給總分，缺少不適用的項目時按適用面向重新分配。不要把同一個問題重複扣分，也不要把個人風格誤判成錯誤。',
  ].join('\n')
}
