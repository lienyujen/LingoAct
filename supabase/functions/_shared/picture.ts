import { callAiJson, errorDetail } from './ai.ts'
import { levelInstruction } from './proficiency.ts'
import { trackInstruction } from './teaching.ts'

// 看圖說話: a four-panel picture the class describes or narrates.
//
// Four panels rather than one, because one picture gets you nouns and four get
// you a story — 先、再、然後、最後, a tense, a reason. That is what the activity
// is for, so the panels have to be one sequence and not four related pictures.
//
// Two calls, and the order matters. A text model plans the story against the
// class's track and level, because that is the model that knows what TBCL 3 or
// 第五學習階段 means; the image model only draws what it is handed. Asking the
// image model to grade its own story produces a picture that looks right and
// teaches nothing in particular.
export type PictureStoryboard = {
  title: string
  cast: string
  panels: string[]
  targetWords: string[]
  pattern: string
  spokenPrompt: string
  writtenPrompt: string
  orderPrompt: string
}

const storyboardSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string' },
    cast: { type: 'string' },
    panels: { type: 'array', minItems: 4, maxItems: 4, items: { type: 'string' } },
    target_words: { type: 'array', minItems: 3, maxItems: 8, items: { type: 'string' } },
    pattern: { type: 'string' },
    spoken_prompt: { type: 'string' },
    written_prompt: { type: 'string' },
    order_prompt: { type: 'string' },
  },
  required: ['title', 'cast', 'panels', 'target_words', 'pattern', 'spoken_prompt', 'written_prompt', 'order_prompt'],
}

const STORYBOARD_RULES = [
  'You are planning a four-panel picture (四格圖) for a 看圖說話 activity. The learners see only the picture — no words appear in it — and then describe or narrate what happens, either aloud or in writing.',
  'The four panels are ONE small everyday story read 左上 → 右上 → 左下 → 右下, with a beginning, something that happens, and an end. Four related pictures with no sequence between them turn the activity into a vocabulary test: the learner names objects instead of telling a story.',
  'Because nothing in the picture can be read, everything the learner is meant to say has to be visible — an action, an object, a facial expression, weather, a time of day. Anything that exists only as a word (a name, a price, a date, someone\'s thoughts) cannot be part of the story.',
  'The level decides how much happens, not merely which words are used. Near the bottom of a scale: one unmistakable action per panel, few objects, no implied feelings, nothing to work out. Higher up: a complication, a reaction, a change of mind — something the learner has to infer and explain rather than only name.',
  'Set the story somewhere these learners actually live unless the teacher\'s direction says otherwise. For a class in Taiwan that means 便利商店, 夜市, 捷運, 騎樓, 早餐店, 學校走廊 — the places whose vocabulary the class will use again.',
  'Write `cast` and `panels` in Traditional Chinese: they are handed to a drawing model and read by the teacher, who is teaching in Taiwan. Everything else — target_words, pattern, spoken_prompt, written_prompt — is what the class hears and says, so write it in the language being taught.',
  '`cast` describes the recurring character and any object that appears in more than one panel, once, concretely enough to be drawn the same way every time: age, clothing colours, hair, and the object\'s shape and colour. Each panel then names them the same way. Describing the milk as a bottle in one panel and a carton in the next is what makes a four-panel picture look like four different stories.',
  'Each panel is ONE frozen moment: one action per person, and nothing that happens before or after it. A panel that says someone stands up, hands something over and then goes back to reading is three moments, and the drawing model resolves it by putting the same person in the panel two or three times. Describe only what a camera would catch in a single frame.',
  'Do not build the story around anything that carries writing — a sign, a menu, a notice, a label, a screen, a ticket, a nameplate. The drawing model letters whatever normally carries lettering, and the characters it invents come out malformed, which is the last thing to put in front of a class learning to read them. Choose a moment that can be understood from what people are doing.',
  '`target_words` are the words the picture is meant to pull out of the learner, `pattern` the sentence pattern or connectives it should lead them into. Both must be within the class\'s level.',
  '`spoken_prompt` and `written_prompt` are the instruction the class is given, in the language being taught: one for saying it aloud, one for writing it down. They differ by more than the verb — speaking asks for a sequence out loud within a minute or two, writing asks for connected sentences or a short paragraph.',
  '`order_prompt` is the instruction for a third use of the same picture: the four panels are cut apart and shuffled, and the class puts them back in order. Say what to work from — what happens first, what it leads to — without naming anything that appears in a particular panel.',
  'Never state the story in the prompts. Telling the class what happens is the answer.',
].join('\n')

// Everything the drawing model needs that is not the story itself. Learned by
// drawing: the first two rules keep the picture usable, and the last one keeps
// it legal to put in front of a class.
const DRAWING_STYLE = [
  // The panels are cut apart down the middle for 圖片排序, so the grid has to be
  // exactly halves — a strip that sits off-centre survives 看圖說話 and comes
  // apart with a neighbour's frame in the corner of it.
  '畫風：乾淨的兒童繪本插畫，明亮的顏色，粗黑輪廓，背景簡單不雜亂。四格大小完全相同，橫向與縱向的白色間隔都要正好通過畫面的正中央，每格加細黑框。',
  '一致性：四格是同一個故事。人物的長相、髮型、衣服顏色，以及重複出現的物品的形狀和顏色，四格完全一樣。',
  '嚴禁文字：畫面中不可以出現任何文字、字母或數字，包含校名牌、站名牌、博愛座標示、招牌、菜單、價目表、包裝、書本內頁、對話框與說明文字，一律留白或改用無字的圖示。如果某個地點只能靠招牌認出來，就改用它的形狀和擺設來畫。也不要畫任何真實存在的商標或連鎖店標誌。這張圖是要讓學生用自己的話講出來的，畫面上出現字就失去意義。',
].join('\n\n')

export function drawingPrompt(storyboard: PictureStoryboard) {
  const panels = ['第一格', '第二格', '第三格', '第四格']
    .map((label, index) => `${label}：${storyboard.panels[index]}`)
    .join('\n')
  return `一張 2x2 四格圖，給語言課的看圖說話練習用。閱讀順序：左上、右上、左下、右下。

固定角色與物品：${storyboard.cast}

${panels}

${DRAWING_STYLE}`
}

function cleanLine(value: unknown, limit: number) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, limit) : ''
}

export async function planPictureStory(input: {
  trackId: string | null
  framework: string | null
  levelCode: string | null
  direction: string
}): Promise<PictureStoryboard> {
  const systemPrompt = [
    STORYBOARD_RULES,
    trackInstruction(input.trackId),
    levelInstruction(input.framework, input.levelCode),
  ].join('\n\n')

  const result = await callAiJson(
    systemPrompt,
    {
      teacher_direction: input.direction || null,
      note: input.direction
        ? null
        : 'The teacher gave no direction. Choose an everyday situation that suits this level and this class, and vary it — do not default to a meal or a shopping trip every time.',
    },
    storyboardSchema,
  )
  if (result.status !== 'success') {
    throw new Error(errorDetail((result.output as { message?: string })?.message, '無法規劃四格圖。'))
  }

  const output = result.output as Record<string, unknown>
  // The model sometimes numbers its own panels — 「右下（圖四）：」 — which would be
  // printed twice, once by it and once by the list the teacher reads.
  const panels = Array.isArray(output.panels)
    ? output.panels.map((panel) => cleanLine(panel, 400).replace(/^\s*(?:[左右][上下])?\s*(?:[（(]?\s*(?:圖|第)?\s*[一二三四1-4]\s*(?:格|張)?\s*[)）]?)?\s*[：:.、]\s*/, ''))
      .filter(Boolean)
    : []
  if (panels.length !== 4) throw new Error('AI 沒有給出完整的四格。')
  const targetWords = Array.isArray(output.target_words)
    ? output.target_words.map((word) => cleanLine(word, 40)).filter(Boolean).slice(0, 8)
    : []

  return {
    title: cleanLine(output.title, 60) || '看圖說話',
    cast: cleanLine(output.cast, 400),
    panels,
    targetWords,
    pattern: cleanLine(output.pattern, 200),
    spokenPrompt: cleanLine(output.spoken_prompt, 300),
    writtenPrompt: cleanLine(output.written_prompt, 300),
    orderPrompt: cleanLine(output.order_prompt, 300),
  }
}

// The drawing models this key can reach, best first. Flash draws these four
// panels in about nine seconds and pro in twenty; both stay well inside the
// function's wall clock, so the fallback exists for availability rather than
// for speed.
function imageModels() {
  const primary = Deno.env.get('GEMINI_IMAGE_MODEL') || 'gemini-3.1-flash-image'
  const fallback = Deno.env.get('GEMINI_IMAGE_FALLBACK_MODEL') || 'gemini-3-pro-image'
  return fallback === primary ? [primary] : [primary, fallback]
}

export async function drawPicture(prompt: string) {
  const apiKey = Deno.env.get('GEMINI_API_KEY')
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured.')

  const models = imageModels()
  let failure = '無法生成圖片。'
  for (const [index, model] of models.entries()) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: 'POST',
          headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            // A 2x2 grid needs the frame to be roughly as tall as it is wide;
            // left to itself the model returns a 16:9 strip and the four panels
            // come out letterboxed.
            generationConfig: { imageConfig: { aspectRatio: '4:3' } },
          }),
          signal: AbortSignal.timeout(index === 0 ? 40_000 : 45_000),
        },
      )
      if (response.ok) {
        const data = await response.json()
        const parts = data.candidates?.[0]?.content?.parts || []
        const image = parts.find((part: { inlineData?: { data?: string } }) => part.inlineData?.data)
        if (image?.inlineData?.data) {
          return {
            data: image.inlineData.data as string,
            mimeType: (image.inlineData.mimeType as string) || 'image/png',
          }
        }
        // A refusal comes back as an ordinary text part, and saying which
        // request was turned down is more use than "no image".
        failure = parts.map((part: { text?: string }) => part.text || '').join(' ').trim().slice(0, 300) || '圖片生成沒有回傳圖片。'
      } else {
        failure = (await response.text()).slice(0, 300) || `圖片生成失敗（${response.status}）。`
      }
    } catch (error) {
      failure = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
        ? `圖片生成逾時（${model}）。`
        : errorDetail(error, '無法生成圖片。')
    }
    if (index < models.length - 1) console.warn(`Image generation unavailable on ${model}; switching to ${models[index + 1]}.`)
  }
  throw new Error(failure)
}
