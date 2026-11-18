// 108 國語文課綱附錄四。篇名用來選擇朗讀聲線；正文依教師採用的版本。
export const GUOYU_CLASSICS = [
  ['燭之武退秦師', 'male'], ['大同與小康', 'unknown'], ['諫逐客書', 'male'],
  ['鴻門宴', 'male'], ['出師表', 'male'], ['桃花源記', 'male'],
  ['師說', 'male'], ['虯髯客傳', 'male'], ['赤壁賦', 'male'],
  ['晚遊六橋待月記', 'male'], ['項脊軒志', 'male'], ['勞山道士', 'male'],
  ['勸和論', 'male'], ['鹿港乘桴記', 'male'], ['畫菊自序', 'female'],
] as const

export type ClassicalVoice = 'male' | 'female' | 'unknown'

export function classicalVoiceForTitle(text: string): ClassicalVoice | undefined {
  const heading = text.trim().split(/\r?\n/u)[0]?.trim().replace(/^〈|〉$/gu, '')
  return GUOYU_CLASSICS.find(([title]) => title === heading)?.[1]
}
